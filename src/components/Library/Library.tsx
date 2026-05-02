import React, { useCallback, useState, useRef, useEffect, useMemo, memo } from 'react';
import { Book, ViewMode, Shelf, Series } from '../../types';
import BookCard from '../BookCard/BookCard';
import BookCover from './BookCover';
import { FilePlus, FolderPlus, Trash2, Heart, RefreshCcw, X, Check, Folder, ArrowLeft, Layers } from 'lucide-react';
import { Virtuoso, VirtuosoGrid, VirtuosoHandle, VirtuosoGridHandle } from 'react-virtuoso';
import './Library.css';

// ── Types ──────────────────────────────────────────────────────────────
type LibraryItem =
  | { type: 'book'; data: Book }
  | { type: 'series'; data: Series; chapters: Book[] };

// ── Series Card ────────────────────────────────────────────────────────
interface SeriesCardProps {
  series: Series;
  chapters: Book[];
  viewMode: ViewMode;
  onClick: () => void;
}

const SeriesCard: React.FC<SeriesCardProps> = ({ series, chapters, viewMode, onClick }) => {
  const firstChapter = useMemo(
    () => [...chapters].sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0))[0],
    [chapters]
  );
  const readCount = chapters.filter(c => c.progress >= 100).length;
  const inProgressCount = chapters.filter(c => c.progress > 0 && c.progress < 100).length;
  const overallProgress = Math.round((readCount / chapters.length) * 100);
  const showProgress = (readCount > 0 || inProgressCount > 0) && readCount < chapters.length;

  if (viewMode === 'list') {
    return (
      <div className="book-card list" onClick={onClick}>
        <div className="book-cover-container">
          {firstChapter && (
            <BookCover src={firstChapter.coverImage} alt={series.name} path={firstChapter.path} />
          )}
          <div className="series-list-badge">
            <Layers size={10} />
            <span>{chapters.length}</span>
          </div>
        </div>
        <div className="book-info">
          <p className="book-title">{series.name}</p>
          <p className="book-author">{chapters.length} {chapters.length === 1 ? 'capítulo' : 'capítulos'}</p>
        </div>
        {readCount > 0 && (
          <span className="series-list-read-badge">{readCount}/{chapters.length} leídos</span>
        )}
      </div>
    );
  }

  return (
    <div className="book-card grid" onClick={onClick}>
      <div className="book-cover-container">
        {firstChapter && (
          <BookCover src={firstChapter.coverImage} alt={series.name} path={firstChapter.path} />
        )}
        <div className="series-grid-badge">
          <Layers size={10} />
          <span>{chapters.length}</span>
        </div>
        {showProgress && (
          <div className="progress-overlay">
            <div className="progress-bar-container">
              <div className="progress-bar" style={{ width: `${overallProgress}%` }} />
            </div>
            <span className="progress-text">{readCount}/{chapters.length}</span>
          </div>
        )}
      </div>
      <div className="book-info">
        <p className="book-title">{series.name}</p>
        <p className="book-author">{chapters.length} {chapters.length === 1 ? 'capítulo' : 'capítulos'}</p>
      </div>
    </div>
  );
};

const MemoizedBookCard = memo(BookCard);
const MemoizedSeriesCard = memo(SeriesCard);

// ── Library ────────────────────────────────────────────────────────────
interface LibraryProps {
  books: Book[];
  viewMode: ViewMode;
  onImportFile: () => void;
  onImportFolder: () => void;
  onBookClick: (book: Book) => void;
  activeCategory: string;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  setSelectedIds: (ids: Set<string>) => void;
  onBulkTrash: () => void;
  onBulkRestore: () => void;
  onBulkFavorite: (fav: boolean) => void;
  onBulkDelete: () => void;
  onOpenMoveModal: () => void;
  onOpenSeriesModal?: () => void;
  shelves: Shelf[];
  onBackToShelves: () => void;
  series?: Series[];
  onSeriesClick?: (series: Series) => void;
}

const Library: React.FC<LibraryProps> = ({
  books, viewMode, onImportFile, onImportFolder, onBookClick, activeCategory,
  selectedIds, toggleSelection, setSelectedIds, onBulkTrash, onBulkRestore, onBulkFavorite, onBulkDelete,
  onOpenMoveModal, onOpenSeriesModal, shelves, onBackToShelves, series = [], onSeriesClick,
}) => {
  const [selectionBox, setSelectionBox] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [columns, setColumns] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const virtuosoGridRef = useRef<VirtuosoGridHandle>(null);
  const isDragging = useRef(false);

  const activeShelf = shelves.find(s => s.id === activeCategory);

  // Build merged items list: series cards + standalone books (only for 'all' view)
  const items = useMemo<LibraryItem[]>(() => {
    const showSeriesCards = activeCategory === 'all' && series.length > 0;

    if (!showSeriesCards) {
      return books.map(b => ({ type: 'book', data: b }));
    }

    const standaloneBooks = books.filter(b => !b.seriesId);
    const seriesItems: LibraryItem[] = series
      .map(s => ({
        type: 'series' as const,
        data: s,
        chapters: books.filter(b => b.seriesId === s.id),
      }))
      .filter(s => s.chapters.length > 0);

    // Sort everything by most recent date
    const withDate: Array<{ item: LibraryItem; date: number }> = [
      ...seriesItems.map(s => {
        const seriesItem = s as { type: 'series'; data: Series; chapters: Book[] };
        return {
          item: s,
          date: Math.max(...seriesItem.chapters.map(c => c.dateAdded)),
        };
      }),
      ...standaloneBooks.map(b => ({ item: { type: 'book' as const, data: b }, date: b.dateAdded })),
    ];

    return withDate.sort((a, b) => b.date - a.date).map(x => x.item);
  }, [books, series, activeCategory]);

  // Track columns for accurate keyboard navigation
  useEffect(() => {
    if (viewMode !== 'grid') {
      setColumns(1);
      return;
    }

    const updateColumns = () => {
      if (containerRef.current) {
        const gridElement = containerRef.current.querySelector('.books-container.grid');
        if (gridElement) {
          const cols = window.getComputedStyle(gridElement)
            .getPropertyValue('grid-template-columns')
            .split(' ').filter(v => v !== '').length;
          if (cols > 0) { setColumns(cols); return; }
        }
        const containerWidth = containerRef.current.clientWidth;
        const cols = Math.max(1, Math.floor((containerWidth - 64 + 32) / (180 + 32)));
        setColumns(cols);
      }
    };

    const observer = new ResizeObserver(() => { setTimeout(updateColumns, 150); updateColumns(); });
    if (containerRef.current) observer.observe(containerRef.current);
    updateColumns();
    return () => observer.disconnect();
  }, [viewMode, items.length]);

  // Marquee selection
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('.virtual-item-container') || (e.target as HTMLElement).closest('button')) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      isDragging.current = true;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionBox({ x1: x, y1: y, x2: x, y2: y });
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) setSelectedIds(new Set());
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !selectionBox) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionBox(prev => prev ? { ...prev, x2: x, y2: y } : null);
      updateSelection(selectionBox.x1, selectionBox.y1, x, y, e.ctrlKey || e.metaKey || e.shiftKey);
    };

    const handleMouseUp = () => { isDragging.current = false; setSelectionBox(null); };

    const updateSelection = (x1: number, y1: number, x2: number, y2: number, keepExisting: boolean) => {
      const left = Math.min(x1, x2), top = Math.min(y1, y2);
      const right = Math.max(x1, x2), bottom = Math.max(y1, y2);
      const containerRect = containerRef.current?.getBoundingClientRect();
      const newSelected = keepExisting ? new Set(selectedIds) : new Set<string>();
      containerRef.current?.querySelectorAll('.virtual-item-container').forEach(item => {
        const r = item.getBoundingClientRect();
        if (!containerRect) return;
        const iTop = r.top - containerRect.top, iLeft = r.left - containerRect.left;
        if (!(iLeft > right || iLeft + r.width < left || iTop > bottom || iTop + r.height < top)) {
          const id = item.getAttribute('data-id');
          if (id) newSelected.add(id);
        }
      });
      setSelectedIds(newSelected);
    };

    const container = containerRef.current;
    container?.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      container?.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [selectionBox, selectedIds, setSelectedIds]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
      if (items.length === 0) return;

      let nextIndex = focusedIndex;
      if (e.key === 'ArrowRight') nextIndex = focusedIndex === -1 ? 0 : Math.min(items.length - 1, focusedIndex + 1);
      else if (e.key === 'ArrowLeft') nextIndex = focusedIndex === -1 ? 0 : Math.max(0, focusedIndex - 1);
      else if (e.key === 'ArrowDown') nextIndex = focusedIndex === -1 ? 0 : Math.min(items.length - 1, focusedIndex + columns);
      else if (e.key === 'ArrowUp') nextIndex = focusedIndex === -1 ? 0 : Math.max(0, focusedIndex - columns);
      else if (e.key === 'Enter' || e.key === ' ') {
        if (focusedIndex >= 0) {
          const item = items[focusedIndex];
          if (item.type === 'series') {
            onSeriesClick?.(item.data);
          } else if (e.ctrlKey || e.metaKey || selectedIds.size > 0) {
            toggleSelection(item.data.id);
          } else {
            onBookClick(item.data);
          }
        }
        return;
      } else return;

      if (nextIndex !== focusedIndex) {
        e.preventDefault();
        setFocusedIndex(nextIndex);
        if (viewMode === 'grid') virtuosoGridRef.current?.scrollToIndex({ index: nextIndex, align: 'center' });
        else virtuosoRef.current?.scrollToIndex({ index: nextIndex, align: 'center' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, items, viewMode, onBookClick, onSeriesClick, toggleSelection, selectedIds.size, columns]);

  const renderItem = useCallback((index: number, item: LibraryItem) => {
    if (item.type === 'series') {
      return (
        <div
          className={`virtual-item-container ${focusedIndex === index ? 'keyboard-focused' : ''}`}
          onClick={() => { setFocusedIndex(index); onSeriesClick?.(item.data); }}
          tabIndex={-1}
        >
          <MemoizedSeriesCard
            series={item.data}
            chapters={item.chapters}
            viewMode={viewMode}
            onClick={() => onSeriesClick?.(item.data)}
          />
        </div>
      );
    }

    const book = item.data;
    return (
      <div
        className={`virtual-item-container ${selectedIds.has(book.id) ? 'selected' : ''} ${focusedIndex === index ? 'keyboard-focused' : ''}`}
        onClick={(e) => {
          setFocusedIndex(index);
          if (e.ctrlKey || e.metaKey || selectedIds.size > 0) {
            e.stopPropagation();
            toggleSelection(book.id);
          } else {
            onBookClick(book);
          }
        }}
        onContextMenu={(e) => { e.preventDefault(); setFocusedIndex(index); toggleSelection(book.id); }}
        data-id={book.id}
        tabIndex={-1}
      >
        <MemoizedBookCard book={book} viewMode={viewMode} isSelected={selectedIds.has(book.id)} />
        {selectedIds.has(book.id) && (
          <div className="selection-indicator"><Check size={16} color="white" /></div>
        )}
      </div>
    );
  }, [viewMode, onBookClick, onSeriesClick, selectedIds, toggleSelection, focusedIndex]);

  const shelfHeader = activeShelf && (
    <div className="shelf-view-header">
      <button className="back-to-shelves-btn" onClick={onBackToShelves}>
        <ArrowLeft size={20} />
        <span>Volver a Mis Estanterías</span>
      </button>
      <div className="shelf-view-info">
        <Folder size={24} className="shelf-icon" />
        <h1>{activeShelf.name}</h1>
        <span className="book-count-badge">{books.length} {books.length === 1 ? 'libro' : 'libros'}</span>
      </div>
    </div>
  );

  if (items.length === 0 && !activeShelf) {
    const showImport = activeCategory !== 'favorites' && activeCategory !== 'deleted';
    return (
      <main className="library-view empty">
        <div className="empty-library">
          <p>
            {activeCategory === 'favorites' ? 'No tienes libros favoritos.' :
             activeCategory === 'deleted' ? 'La papelera está vacía.' :
             'No se encontraron libros en esta colección.'}
          </p>
          {showImport && (
            <div className="empty-actions">
              <button className="import-btn-large" onClick={onImportFile}>
                <FilePlus size={24} /><span>Importar archivo</span>
              </button>
              <button className="import-btn-large" onClick={onImportFolder}>
                <FolderPlus size={24} /><span>Importar carpeta</span>
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className={`library-view ${viewMode}`} ref={containerRef}>
      {shelfHeader}

      {items.length === 0 && activeShelf ? (
        <div className="empty-shelf-message"><p>Esta estantería está vacía.</p></div>
      ) : (
        <>
          {viewMode === 'grid' ? (
            <VirtuosoGrid
              ref={virtuosoGridRef}
              data={items}
              totalCount={items.length}
              itemContent={renderItem}
              listClassName="books-container grid"
              itemClassName="virtual-grid-item"
            />
          ) : (
            <Virtuoso
              ref={virtuosoRef}
              data={items}
              totalCount={items.length}
              itemContent={renderItem}
              className="books-container list"
            />
          )}
        </>
      )}

      {/* Selection Marquee */}
      {selectionBox && (
        <div
          className="selection-marquee"
          style={{
            left: Math.min(selectionBox.x1, selectionBox.x2),
            top: Math.min(selectionBox.y1, selectionBox.y2),
            width: Math.abs(selectionBox.x2 - selectionBox.x1),
            height: Math.abs(selectionBox.y2 - selectionBox.y1),
          }}
        />
      )}

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="selection-bar">
          <div className="selection-info">
            <button className="close-selection" onClick={() => setSelectedIds(new Set())}>
              <X size={18} />
            </button>
            <span>{selectedIds.size} seleccionados</span>
          </div>
          <div className="selection-actions">
            {activeCategory === 'deleted' ? (
              <>
                <button onClick={onBulkRestore} title="Restaurar"><RefreshCcw size={18} /><span>Restaurar</span></button>
                <button className="danger" onClick={onBulkDelete} title="Eliminar permanentemente"><Trash2 size={18} /><span>Eliminar</span></button>
              </>
            ) : (
              <>
                <button onClick={() => onBulkFavorite(true)} title="Añadir a favoritos"><Heart size={18} /><span>Favorito</span></button>
                <button onClick={onOpenMoveModal} title="Mover a estantería"><Folder size={18} /><span>Estantería</span></button>
                <button onClick={onOpenSeriesModal} title="Añadir a serie"><Layers size={18} /><span>Serie</span></button>
                <button onClick={onBulkTrash} title="Mover a la papelera"><Trash2 size={18} /><span>Borrar</span></button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
};

export default Library;
