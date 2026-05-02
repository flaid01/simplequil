import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Book as BookIcon, Star, History, Folder, Trash2, Settings, Command } from 'lucide-react';
import { Book, Shelf } from '../../types';
import './CommandPalette.css';

interface CommandPaletteProps {
  books: Book[];
  shelves: Shelf[];
  onClose: () => void;
  onSelectBook: (book: Book) => void;
  onNavigate: (category: string) => void;
}

interface CommandItem {
  id: string;
  type: 'command';
  label: string;
  flag: string;
  icon: React.ReactNode;
}

interface ShelfItem {
  id: string;
  type: 'shelf';
  label: string;
  icon: React.ReactNode;
}

const COMMANDS: CommandItem[] = [
  { id: 'all', type: 'command', label: 'Ver todos los libros', flag: '-all', icon: <BookIcon size={18} /> },
  { id: 'favorites', type: 'command', label: 'Ver favoritos', flag: '-f', icon: <Star size={18} /> },
  { id: 'recent', type: 'command', label: 'Ver recientes', flag: '-r', icon: <History size={18} /> },
  { id: 'shelves_list', type: 'command', label: 'Ver mis estanterías', flag: '-s', icon: <Folder size={18} /> },
  { id: 'deleted', type: 'command', label: 'Ver papelera', flag: '-t', icon: <Trash2 size={18} /> },
  { id: 'settings', type: 'command', label: 'Abrir configuración', flag: '-set', icon: <Settings size={18} /> },
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ books, shelves, onClose, onSelectBook, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    
    // If it starts with -, show commands only
    if (q.startsWith('-')) {
      return COMMANDS.filter(c => c.flag.startsWith(q) || c.label.toLowerCase().includes(q));
    }

    // Filter Books
    const filteredBooks = books
      .filter(b => !b.isDeleted)
      .filter(b => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
      .slice(0, 10);

    // Filter Shelves
    const filteredShelves: ShelfItem[] = shelves
      .filter(s => s.name.toLowerCase().includes(q))
      .map(s => ({
        id: s.id,
        type: 'shelf',
        label: `Estantería: ${s.name}`,
        icon: <Folder size={18} />
      }));

    // Filter Global Commands
    const filteredCommands = COMMANDS.filter(c => c.label.toLowerCase().includes(q));
    
    return [...filteredCommands, ...filteredShelves, ...filteredBooks];
  }, [query, books, shelves]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results[selectedIndex];
      if (!selected) return;

      if ('type' in selected) {
        if (selected.type === 'command' || selected.type === 'shelf') {
          onNavigate(selected.id);
        }
      } else {
        onSelectBook(selected as Book);
      }
      onClose();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <motion.div 
        className="command-palette-container"
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        transition={{ duration: 0.15 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="palette-search">
          <Search size={20} />
          <input 
            ref={inputRef}
            autoFocus
            type="text" 
            placeholder="Busca un libro, estantería o usa flags (-f, -s)..." 
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="palette-shortcut-hint">
            <Command size={14} />
            <span>K</span>
          </div>
        </div>

        <div className="palette-results">
          {results.length > 0 ? (
            results.map((item, index) => {
              const isGeneric = 'type' in item;
              return (
                <div 
                  key={item.id} 
                  className={`palette-item ${index === selectedIndex ? 'selected' : ''}`}
                  onClick={() => {
                    if (isGeneric) {
                      onNavigate(item.id);
                    } else {
                      onSelectBook(item as Book);
                    }
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="palette-item-icon">
                    {isGeneric ? (item as any).icon : <BookIcon size={18} />}
                  </div>
                  <div className="palette-item-info">
                    <span className="palette-item-label">
                      {isGeneric ? (item as any).label : (item as Book).title}
                    </span>
                    {!isGeneric && (
                      <span className="palette-item-sub">{(item as Book).author}</span>
                    )}
                  </div>
                  {isGeneric && (item as any).flag && (
                    <div className="palette-item-flag">{(item as any).flag}</div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="palette-no-results">No se encontraron resultados</div>
          )}
        </div>

        <div className="palette-footer">
          <div className="palette-hint">
            <kbd>↑↓</kbd><span>Navegar</span>
          </div>
          <div className="palette-hint">
            <kbd>↵</kbd><span>Seleccionar</span>
          </div>
          <div className="palette-hint">
            <kbd>esc</kbd><span>Cerrar</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default CommandPalette;
