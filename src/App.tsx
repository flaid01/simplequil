import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Sidebar from "./components/Sidebar/Sidebar";
import TopBar from "./components/TopBar/TopBar";
import Library from "./components/Library/Library";
import BottomBar from "./components/BottomBar/BottomBar";
import EpubReader from "./components/EpubReader/EpubReader";
import PdfReader from "./components/PdfReader/PdfReader";
import CbzReader from "./components/CbzReader/CbzReader";
import BookDetails from "./components/BookDetails/BookDetails";
import Settings from "./components/Settings/Settings";
import CommandPalette from "./components/CommandPalette/CommandPalette";
import { Book, ViewMode, SortOption, FileType, Shelf, ThemeType, Series } from "./types";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import ShelfSelectorModal from "./components/Library/ShelfSelectorModal";
import ShelfCreationModal from "./components/Library/ShelfCreationModal";
import SeriesSelectorModal from "./components/Library/SeriesSelectorModal";
import ShelvesList from "./components/Library/ShelvesList";
import SeriesDetail from "./components/Library/SeriesDetail";
import { AnimatePresence } from "framer-motion";
import "./App.css";

// DB Mapping Utilities
const mapBookFromDb = (row: any): Book => ({
  id: row.id,
  path: row.path,
  title: row.title,
  author: row.author,
  coverImage: row.cover_image,
  progress: row.progress,
  fileType: row.file_type as FileType,
  dateAdded: row.date_added,
  lastOpened: row.last_opened,
  isFavorite: row.is_favorite === 1,
  isDeleted: row.is_deleted === 1,
  shelfId: row.category,
  synopsis: row.synopsis,
  language: row.language,
  seriesId: row.series_id || undefined,
  seriesName: row.series_name || undefined,
  volumeNumber: row.volume_number ?? undefined,
});

const mapShelfFromDb = (row: any): Shelf => ({
  id: row.id,
  name: row.name,
  bookIds: [], 
});

function App() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortOption, setSortOption] = useState<SortOption>("date");
  const [searchQuery, setSearchQuery] = useState("");
  const [books, setBooks] = useState<Book[]>([]);
  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [readingBook, setReadingBook] = useState<Book | null>(null);
  const [viewingBook, setViewingBook] = useState<Book | null>(null);
  const [viewingSeries, setViewingSeries] = useState<Series | null>(null);
  const [theme, setTheme] = useState<ThemeType>('light');
  const [openDirectlyToReader, setOpenDirectlyToReader] = useState(false);
  const [launcherOpenDirectly, setLauncherOpenDirectly] = useState(false);
  
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false);
  const [isCreateShelfModalOpen, setIsCreateShelfModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  
  const dbRef = useRef<Database | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkTrash = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBooks(prev => prev.map(b => ids.includes(b.id) ? { ...b, isDeleted: true } : b));
    setSelectedIds(new Set());
    if (dbRef.current) {
      await dbRef.current.execute(`UPDATE books SET is_deleted = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBooks(prev => prev.map(b => ids.includes(b.id) ? { ...b, isDeleted: false } : b));
    setSelectedIds(new Set());
    if (dbRef.current) {
      await dbRef.current.execute(`UPDATE books SET is_deleted = 0 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
  };

  const handleBulkFavorite = async (favorite: boolean) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBooks(prev => prev.map(b => ids.includes(b.id) ? { ...b, isFavorite: favorite } : b));
    setSelectedIds(new Set());
    if (dbRef.current) {
      await dbRef.current.execute(`UPDATE books SET is_favorite = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [favorite ? 1 : 0, ...ids]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBooks(prev => prev.filter(b => !ids.includes(b.id)));
    setSelectedIds(new Set());
    if (dbRef.current) {
      await dbRef.current.execute(`DELETE FROM books WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
  };

  const handleCreateShelf = async (name: string) => {
    if (!dbRef.current || !name.trim()) return;
    const newShelf: Shelf = {
      id: crypto.randomUUID(),
      name: name.trim(),
      bookIds: [],
    };
    
    setShelves(prev => [...prev, newShelf]);
    await dbRef.current.execute("INSERT INTO shelves (id, name) VALUES (?, ?)", [newShelf.id, newShelf.name]);
    return newShelf.id;
  };

  const handleCreateShelfWithBooks = async (name: string, bookIds: string[]) => {
    const shelfId = await handleCreateShelf(name);
    if (shelfId && bookIds.length > 0) {
      setBooks(prev => prev.map(b => bookIds.includes(b.id) ? { ...b, shelfId } : b));
      if (dbRef.current) {
        await dbRef.current.execute(
          `UPDATE books SET category = ? WHERE id IN (${bookIds.map(() => '?').join(',')})`,
          [shelfId, ...bookIds]
        );
      }
    }
    setIsCreateShelfModalOpen(false);
  };

  const handleDeleteShelf = async (id: string) => {
    if (!dbRef.current) return;
    setShelves(prev => prev.filter(s => s.id !== id));
    if (activeCategory === id) setActiveCategory('all');
    
    setBooks(prev => prev.map(b => b.shelfId === id ? { ...b, shelfId: 'all' } : b));
    
    await dbRef.current.execute("DELETE FROM shelves WHERE id = ?", [id]);
    await dbRef.current.execute("UPDATE books SET category = 'all' WHERE category = ?", [id]);
  };

  const handleMoveToShelf = async (shelfId: string) => {
    if (!dbRef.current || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    
    setBooks(prev => prev.map(b => ids.includes(b.id) ? { ...b, shelfId } : b));
    setSelectedIds(new Set());
    setIsMoveModalOpen(false);

    await dbRef.current.execute(
      `UPDATE books SET category = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      [shelfId, ...ids]
    );
  };

  const handleCreateSeriesForModal = async (name: string): Promise<string | undefined> => {
    if (!dbRef.current) return undefined;
    const existing = series.find(s => s.name === name);
    if (existing) return existing.id;
    const id = crypto.randomUUID();
    await dbRef.current.execute("INSERT INTO series (id, name) VALUES (?, ?)", [id, name]);
    setSeries(prev => [...prev, { id, name }]);
    return id;
  };

  const handleAddToSeries = async (seriesId: string | null, seriesName: string | null) => {
    if (!dbRef.current || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBooks(prev => prev.map(b => ids.includes(b.id)
      ? { ...b, seriesId: seriesId ?? undefined, seriesName: seriesName ?? undefined }
      : b
    ));
    setSelectedIds(new Set());
    setIsSeriesModalOpen(false);
    await dbRef.current.execute(
      `UPDATE books SET series_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
      [seriesId, ...ids]
    );
  };

  const handleReorderChapters = async (orderedIds: string[]) => {
    if (!dbRef.current) return;

    setBooks(prev => {
      const next = [...prev];
      orderedIds.forEach((id, index) => {
        const idx = next.findIndex(b => b.id === id);
        if (idx !== -1) {
          next[idx] = { ...next[idx], volumeNumber: index + 1 };
        }
      });
      return next;
    });

    try {
      await dbRef.current.execute("BEGIN TRANSACTION");
      for (let i = 0; i < orderedIds.length; i++) {
        await dbRef.current.execute(
          "UPDATE books SET volume_number = ? WHERE id = ?",
          [i + 1, orderedIds[i]]
        );
      }
      await dbRef.current.execute("COMMIT");
    } catch (err) {
      console.error("Failed to save new order:", err);
      await dbRef.current.execute("ROLLBACK");
    }
  };

  const handleUpdateSeriesName = async (id: string, newName: string) => {
    if (!dbRef.current) return;
    setSeries(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
    setBooks(prev => prev.map(b => b.seriesId === id ? { ...b, seriesName: newName } : b));
    if (viewingSeries?.id === id) {
      setViewingSeries(prev => prev ? { ...prev, name: newName } : null);
    }
    await dbRef.current.execute("UPDATE series SET name = ? WHERE id = ?", [newName, id]);
  };

  const handleUpdateSeriesAuthor = async (id: string, newAuthor: string) => {
    if (!dbRef.current) return;
    setSeries(prev => prev.map(s => s.id === id ? { ...s, author: newAuthor } : s));
    if (viewingSeries?.id === id) {
      setViewingSeries(prev => prev ? { ...prev, author: newAuthor } : null);
    }
    await dbRef.current.execute("UPDATE series SET author = ? WHERE id = ?", [newAuthor, id]);
  };

  const handleUpdateSeriesSynopsis = async (id: string, newSynopsis: string) => {
    if (!dbRef.current) return;
    setSeries(prev => prev.map(s => s.id === id ? { ...s, synopsis: newSynopsis } : s));
    if (viewingSeries?.id === id) {
      setViewingSeries(prev => prev ? { ...prev, synopsis: newSynopsis } : null);
    }
    await dbRef.current.execute("UPDATE series SET synopsis = ? WHERE id = ?", [newSynopsis, id]);
  };

  const handleUpdateSeriesCover = async (id: string, newCover: string) => {
    if (!dbRef.current) return;
    setSeries(prev => prev.map(s => s.id === id ? { ...s, coverImage: newCover } : s));
    if (viewingSeries?.id === id) {
      setViewingSeries(prev => prev ? { ...prev, coverImage: newCover } : null);
    }
    await dbRef.current.execute("UPDATE series SET cover_image = ? WHERE id = ?", [newCover, id]);
  };

  const handleDeleteSeries = async (id: string) => {
    if (!dbRef.current) return;
    if (!window.confirm("¿Estás seguro de que quieres eliminar esta serie? Los libros se mantendrán pero dejarán de estar agrupados.")) return;
    
    setSeries(prev => prev.filter(s => s.id !== id));
    setBooks(prev => prev.map(b => b.seriesId === id ? { ...b, seriesId: undefined, seriesName: undefined } : b));
    setViewingSeries(null);

    await dbRef.current.execute("DELETE FROM series WHERE id = ?", [id]);
    await dbRef.current.execute("UPDATE books SET series_id = NULL WHERE series_id = ?", [id]);
  };

  const handleToggleFavorite = async (id: string) => {
    const book = books.find(b => b.id === id);
    if (!book) return;

    const newFavoriteStatus = !book.isFavorite;

    setBooks(prev => prev.map(b => b.id === id ? { ...b, isFavorite: newFavoriteStatus } : b));
    if (viewingBook?.id === id) {
      setViewingBook(prev => prev ? { ...prev, isFavorite: newFavoriteStatus } : null);
    }

    if (dbRef.current) {
      dbRef.current.execute("UPDATE books SET is_favorite = ? WHERE id = ?", [newFavoriteStatus ? 1 : 0, id]);
    }
  };

  const handleImportFile = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Books', extensions: ['epub', 'pdf', 'mobi', 'cbz'] }]
      });
      
      if (!selected || !Array.isArray(selected)) return;
      const existingPaths = new Set(books.map(b => b.path));
      const uniqueSelected = selected.filter(p => !existingPaths.has(p));

      const newBooks: Book[] = await Promise.all(uniqueSelected.map(async (fullPath) => {
        try {
          const metadata = await invoke("scan_file", { path: fullPath }) as any;
          return {
            ...metadata,
            coverImage: metadata.cover_image,
            fileType: metadata.file_type,
            dateAdded: metadata.date_added,
            lastOpened: metadata.last_opened,
            isFavorite: metadata.is_favorite,
            isDeleted: metadata.is_deleted,
            shelfId: metadata.category || 'all',
          } as Book;
        } catch (e) {
          console.error(`Error scanning file ${fullPath}:`, e);
          return null;
        }
      })).then(results => results.filter((b): b is Book => b !== null));

      if (newBooks.length > 0) {
        setBooks(prev => [...newBooks, ...prev]);
        saveBooksToDb(newBooks);
      }
    } catch (err) { console.error("Dialog error:", err); }
  };

  const handleImportFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === "string") {
        const results = await invoke("scan_directory", { path: selected }) as any[];

        // Upsert any discovered series to the DB and local state
        const seriesMap = new Map<string, string>(); // id -> name
        results.forEach((m: any) => {
          if (m.series_id && m.series_name) {
            seriesMap.set(m.series_id, m.series_name);
          }
        });

        if (dbRef.current && seriesMap.size > 0) {
          for (const [id, name] of seriesMap) {
            await dbRef.current.execute(
              "INSERT OR IGNORE INTO series (id, name) VALUES (?, ?)",
              [id, name]
            );
          }
          setSeries(prev => {
            const existing = new Set(prev.map(s => s.id));
            const newSeries = [...seriesMap.entries()]
              .filter(([id]) => !existing.has(id))
              .map(([id, name]) => ({ id, name }));
            return [...prev, ...newSeries];
          });
        }

        const existingPaths = new Set(books.map(b => b.path));

        // Books not yet in library → insert
        const newBooks: Book[] = results
          .filter((metadata: any) => !existingPaths.has(metadata.path))
          .map((metadata: any) => ({
            ...metadata,
            coverImage: metadata.cover_image,
            fileType: metadata.file_type,
            dateAdded: metadata.date_added,
            lastOpened: metadata.last_opened,
            isFavorite: metadata.is_favorite,
            isDeleted: metadata.is_deleted,
            shelfId: metadata.category || 'all',
            seriesId: metadata.series_id || undefined,
            seriesName: metadata.series_name || undefined,
            volumeNumber: metadata.volume_number ?? undefined,
          } as Book));

        if (newBooks.length > 0) {
          setBooks((prev) => [...newBooks, ...prev]);
          saveBooksToDb(newBooks);
        }

        // Existing books that now have series info → update series_id
        if (dbRef.current) {
          const seriesUpdates = results.filter(
            (m: any) => existingPaths.has(m.path) && m.series_id
          );
          if (seriesUpdates.length > 0) {
            setBooks(prev => prev.map(b => {
              const update = seriesUpdates.find((m: any) => m.path === b.path);
              if (update) return { ...b, seriesId: update.series_id, volumeNumber: update.volume_number ?? b.volumeNumber };
              return b;
            }));
            for (const m of seriesUpdates) {
              await dbRef.current!.execute(
                "UPDATE books SET series_id = ?, volume_number = ? WHERE path = ?",
                [m.series_id, m.volume_number ?? null, m.path]
              );
            }
          }
        }
      }
    } catch (err) { console.error("Folder error:", err); }
  };

  const saveBooksToDb = async (newBooks: Book[]) => {
    if (!dbRef.current || newBooks.length === 0) return;

    try {
      await dbRef.current.execute("BEGIN TRANSACTION", []);
      for (const book of newBooks) {
        await dbRef.current.execute(
          `INSERT OR IGNORE INTO books
          (id, path, title, author, cover_image, file_type, progress, date_added, last_opened, is_favorite, is_deleted, synopsis, language, category, series_id, volume_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            book.id, book.path, book.title, book.author, book.coverImage,
            book.fileType, book.progress, book.dateAdded, book.lastOpened,
            book.isFavorite ? 1 : 0, book.isDeleted ? 1 : 0,
            book.synopsis, book.language, book.shelfId || 'all',
            book.seriesId || null, book.volumeNumber ?? null
          ]
        );
      }
      await dbRef.current.execute("COMMIT", []);
    } catch (err) {
      console.error("Failed to save books to database:", err);
      if (dbRef.current) await dbRef.current.execute("ROLLBACK", []);
    }
  };

  const handleBookOpen = async (book: Book) => {
    const now = Date.now();
    setBooks(prev => prev.map(b => b.id === book.id ? { ...b, lastOpened: now } : b));
    setReadingBook({ ...book, lastOpened: now });
    setViewingBook(null);

    if (dbRef.current) {
      dbRef.current.execute("UPDATE books SET last_opened = ? WHERE id = ?", [now, book.id]);
    }
  };

  const handleSelectBook = (book: Book) => {
    if (openDirectlyToReader && (book.fileType === 'epub' || book.fileType === 'pdf' || book.fileType === 'cbz')) {
      handleBookOpen(book);
    } else {
      setViewingBook(book);
    }
  };

  const handleLauncherSelectBook = (book: Book) => {
    if (launcherOpenDirectly && (book.fileType === 'epub' || book.fileType === 'pdf' || book.fileType === 'cbz')) {
      handleBookOpen(book);
    } else {
      setViewingBook(book);
    }
  };

  const handlePaletteNavigate = (category: string) => {
    setActiveCategory(category);
    setReadingBook(null); // Close reader if navigating elsewhere
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger main shortcuts if palette is open (palette handles its own)
      if (isCommandPaletteOpen) return;

      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const key = e.key.toLowerCase();

      // Esc: Close stuff
      if (e.key === 'Escape') {
        if (isCreateShelfModalOpen) setIsCreateShelfModalOpen(false);
        else if (isMoveModalOpen) setIsMoveModalOpen(false);
        else if (isSeriesModalOpen) setIsSeriesModalOpen(false);
        else if (readingBook) setReadingBook(null);
        else if (viewingSeries) setViewingSeries(null);
        else if (viewingBook) setViewingBook(null);
        else if (activeCategory === 'settings') setActiveCategory('all');
        else if (selectedIds.size > 0) setSelectedIds(new Set());
      }

      // Ctrl + K: Command Palette
      if (isMod && key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }

      // Ctrl + B: Jump to Sidebar / Toggle Sidebar
      if (isMod && key === 'b') {
        e.preventDefault();
        const sidebarItems = document.querySelectorAll('.sidebar .nav-item');
        if (sidebarItems.length > 0) {
          (sidebarItems[0] as HTMLButtonElement).focus();
        }
      }

      // Ctrl + O: Import File
      if (isMod && !isShift && key === 'o') {
        e.preventDefault();
        handleImportFile();
      }

      // Ctrl + Shift + O: Import Folder
      if (isMod && isShift && key === 'o') {
        e.preventDefault();
        handleImportFolder();
      }

      // Ctrl + F: Focus Search
      if (isMod && key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // G: Grid View
      if (!isMod && key === 'g' && !readingBook) {
        setViewMode('grid');
      }

      // L: List View
      if (!isMod && key === 'l' && !readingBook) {
        setViewMode('list');
      }

      // F: Toggle Favorite for selected or viewing
      if (!isMod && key === 'f' && !readingBook) {
        if (viewingBook) {
          handleToggleFavorite(viewingBook.id);
        } else if (selectedIds.size > 0) {
          const ids = Array.from(selectedIds);
          const first = books.find(b => b.id === ids[0]);
          if (first) handleBulkFavorite(!first.isFavorite);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCreateShelfModalOpen, isMoveModalOpen, isSeriesModalOpen, viewingBook, viewingSeries, activeCategory,
    selectedIds, readingBook, books, isCommandPaletteOpen, handleImportFile, handleImportFolder, 
    handleToggleFavorite, handleBulkFavorite
  ]);

  // Initialize Database and Load Data
  useEffect(() => {
    const initDb = async () => {
      try {
        const db = await Database.load("sqlite:library.db");
        dbRef.current = db;

        // 1. Load Settings
        const settingsRows = await db.select<any[]>("SELECT * FROM settings");
        settingsRows.forEach(row => {
          if (row.key === 'theme') setTheme(row.value as ThemeType);
          if (row.key === 'view_mode') setViewMode(row.value as ViewMode);
          if (row.key === 'sort_option') setSortOption(row.value as SortOption);
          if (row.key === 'sidebar_collapsed') setIsSidebarCollapsed(row.value === 'true');
          if (row.key === 'open_directly_to_reader') setOpenDirectlyToReader(row.value === 'true');
          if (row.key === 'launcher_open_directly') setLauncherOpenDirectly(row.value === 'true');
        });

        // Ensure series table and book columns exist (guards against missing migrations)
        await db.execute(`CREATE TABLE IF NOT EXISTS series (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          cover_image TEXT
        )`);
        try { await db.execute("ALTER TABLE books ADD COLUMN series_id TEXT"); } catch {}
        try { await db.execute("ALTER TABLE books ADD COLUMN volume_number INTEGER"); } catch {}
        // Prevent duplicate paths from accumulating
        try { await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_books_path ON books(path)"); } catch {}

        // 2. Load Shelves
        const shelfRows = await db.select<any[]>("SELECT * FROM shelves");
        setShelves(shelfRows.map(mapShelfFromDb));

        // 3. Load Series
        const seriesRows = await db.select<any[]>("SELECT * FROM series");
        setSeries(seriesRows.map(row => ({ 
          id: row.id, 
          name: row.name, 
          coverImage: row.cover_image || undefined,
          author: row.author || undefined,
          synopsis: row.synopsis || undefined
        })));

        // 4. Load Books (JOIN with series to get series_name)
        const bookRows = await db.select<any[]>(
          "SELECT b.*, s.name as series_name FROM books b LEFT JOIN series s ON b.series_id = s.id ORDER BY b.date_added DESC"
        );
        setBooks(bookRows.map(mapBookFromDb));

      } catch (err) {
        console.error("Failed to initialize database:", err);
      }
    };

    initDb();
  }, []);

  // Persist Settings
  useEffect(() => {
    if (dbRef.current) {
      dbRef.current.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['theme', theme]);
    }
  }, [theme]);

  useEffect(() => {
    if (dbRef.current) {
      dbRef.current.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['sidebar_collapsed', isSidebarCollapsed ? 'true' : 'false']);
    }
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (dbRef.current) {
      dbRef.current.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['view_mode', viewMode]);
    }
  }, [viewMode]);

  useEffect(() => {
    if (dbRef.current) {
      dbRef.current.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['sort_option', sortOption]);
    }
  }, [sortOption]);

  useEffect(() => {
    if (dbRef.current) {
      dbRef.current.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['open_directly_to_reader', openDirectlyToReader ? 'true' : 'false']);
    }
  }, [openDirectlyToReader]);

  useEffect(() => {
    if (dbRef.current) {
      dbRef.current.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['launcher_open_directly', launcherOpenDirectly ? 'true' : 'false']);
    }
  }, [launcherOpenDirectly]);

  const filteredBooks = useMemo(() => {
    let results = books.filter((book) => {
      const matchesSearch = book.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           book.author.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      
      if (activeCategory === "favorites") return book.isFavorite && !book.isDeleted;
      if (activeCategory === "deleted") return book.isDeleted;
      if (activeCategory === "recent") return book.lastOpened > 0 && book.lastOpened !== book.dateAdded && !book.isDeleted;
      if (activeCategory === "reading") return book.progress > 0 && book.progress < 100 && !book.isDeleted;
      if (activeCategory === "read") return book.progress >= 100 && !book.isDeleted;
      if (activeCategory === "epub") return book.fileType === 'epub' && !book.isDeleted;
      if (activeCategory === "pdf") return book.fileType === 'pdf' && !book.isDeleted;
      if (activeCategory === "mobi") return book.fileType === 'mobi' && !book.isDeleted;
      if (activeCategory === "cbz") return book.fileType === 'cbz' && !book.isDeleted;
      
      const isCustomShelf = shelves.some(s => s.id === activeCategory);
      if (isCustomShelf) return book.shelfId === activeCategory && !book.isDeleted;

      if (activeCategory === "all") return !book.isDeleted;
      return !book.isDeleted;
    });

    if (activeCategory === "recent") {
      return [...results].sort((a, b) => b.lastOpened - a.lastOpened);
    }

    return [...results].sort((a, b) => {
      if (sortOption === 'title') return a.title.localeCompare(b.title);
      if (sortOption === 'author') return a.author.localeCompare(b.author);
      if (sortOption === 'date') return b.dateAdded - a.dateAdded;
      if (sortOption === 'progress') return b.progress - a.progress;
      return 0;
    });
  }, [books, searchQuery, activeCategory, sortOption, shelves]);

  const handleProgressUpdate = useCallback(async (id: string, progress: number) => {
    const formattedProgress = Math.round(progress * 100) / 100;
    setBooks(prev => prev.map(b => b.id === id ? { ...b, progress: formattedProgress } : b));
    if (dbRef.current) {
      dbRef.current.execute("UPDATE books SET progress = ? WHERE id = ?", [formattedProgress, id]);
    }
  }, []);

  return (
    <div className={`app-container theme-${theme}`}>
      {readingBook ? (
        readingBook.fileType === 'epub' ? (
          <EpubReader 
            book={readingBook} 
            onClose={() => setReadingBook(null)} 
            theme={theme}
            setTheme={setTheme}
            onProgressUpdate={handleProgressUpdate}
          />
        ) : readingBook.fileType === 'pdf' ? (
          <PdfReader 
            book={readingBook} 
            onClose={() => setReadingBook(null)} 
          />
        ) : readingBook.fileType === 'cbz' ? (
          <CbzReader
            book={readingBook}
            onClose={() => setReadingBook(null)}
            theme={theme}
            setTheme={setTheme}
            onProgressUpdate={handleProgressUpdate}
          />
        ) : null
      ) : (
        <>
          <Sidebar
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            shelves={shelves}
            onDeleteShelf={handleDeleteShelf}
            onCreateShelf={() => setIsCreateShelfModalOpen(true)}
          />
          <div className="main-content">
            {activeCategory === 'shelves_list' ? (
              <ShelvesList
                shelves={shelves}
                books={books}
                onShelfClick={setActiveCategory}
                onDeleteShelf={handleDeleteShelf}
              />
            ) : (
              <>
                <TopBar 
                  viewMode={viewMode} 
                  setViewMode={setViewMode}
                  sortOption={sortOption}
                  setSortOption={setSortOption}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                  onImportFile={handleImportFile}
                  onImportFolder={handleImportFolder}
                  searchInputRef={searchInputRef}
                />
                <Library
                  books={filteredBooks}
                  viewMode={viewMode}
                  onImportFile={handleImportFile}
                  onImportFolder={handleImportFolder}
                  onBookClick={handleSelectBook}
                  activeCategory={activeCategory}
                  selectedIds={selectedIds}
                  toggleSelection={toggleSelection}
                  setSelectedIds={setSelectedIds}
                  onBulkTrash={handleBulkTrash}
                  onBulkRestore={handleBulkRestore}
                  onBulkFavorite={handleBulkFavorite}
                  onBulkDelete={handleBulkDelete}
                  onOpenMoveModal={() => setIsMoveModalOpen(true)}
                  onOpenSeriesModal={() => setIsSeriesModalOpen(true)}
                  shelves={shelves}
                  onBackToShelves={() => setActiveCategory('shelves_list')}
                  series={series}
                  onSeriesClick={setViewingSeries}
                />
              </>
            )}
            {books.length > 0 && (
              <BottomBar 
                currentBook={[...books].sort((a, b) => b.lastOpened - a.lastOpened)[0]} 
                onRead={handleBookOpen}
              />
            )}
          </div>
          
          <AnimatePresence>
            {viewingBook && (
              <BookDetails
                book={viewingBook}
                onClose={() => setViewingBook(null)}
                onRead={handleBookOpen}
                onToggleFavorite={handleToggleFavorite}
              />
            )}
          </AnimatePresence>

          {viewingSeries && (
            <SeriesDetail
              series={viewingSeries}
              chapters={books.filter(b => b.seriesId === viewingSeries.id && !b.isDeleted)}
              onClose={() => setViewingSeries(null)}
              onReadChapter={(book) => { setViewingSeries(null); handleBookOpen(book); }}
              onToggleFavorite={handleToggleFavorite}
              onReorderChapters={handleReorderChapters}
              onUpdateSeriesName={handleUpdateSeriesName}
              onUpdateSeriesAuthor={handleUpdateSeriesAuthor}
              onUpdateSeriesSynopsis={handleUpdateSeriesSynopsis}
              onUpdateSeriesCover={handleUpdateSeriesCover}
              onDeleteSeries={handleDeleteSeries}
            />
          )}

          {activeCategory === 'settings' && (
            <Settings 
              onClose={() => setActiveCategory('all')} 
              theme={theme}
              setTheme={setTheme}
              openDirectlyToReader={openDirectlyToReader}
              setOpenDirectlyToReader={setOpenDirectlyToReader}
              launcherOpenDirectly={launcherOpenDirectly}
              setLauncherOpenDirectly={setLauncherOpenDirectly}
            />
          )}

          {isMoveModalOpen && (
            <ShelfSelectorModal
              shelves={shelves}
              onClose={() => setIsMoveModalOpen(false)}
              onSelectShelf={handleMoveToShelf}
              onCreateShelf={handleCreateShelf}
            />
          )}

          {isSeriesModalOpen && (
            <SeriesSelectorModal
              series={series}
              onClose={() => setIsSeriesModalOpen(false)}
              onSelectSeries={handleAddToSeries}
              onCreateSeries={handleCreateSeriesForModal}
            />
          )}

          {isCreateShelfModalOpen && (
            <ShelfCreationModal 
              books={books}
              onClose={() => setIsCreateShelfModalOpen(false)}
              onConfirm={handleCreateShelfWithBooks}
            />
          )}
        </>
      )}

      <AnimatePresence>
        {isCommandPaletteOpen && (
          <CommandPalette 
            books={books}
            shelves={shelves}
            onClose={() => setIsCommandPaletteOpen(false)}
            onSelectBook={handleLauncherSelectBook}
            onNavigate={handlePaletteNavigate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
