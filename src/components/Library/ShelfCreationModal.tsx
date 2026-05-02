import React, { useState, useMemo } from 'react';
import { Book } from '../../types';
import { X, Search, Check } from 'lucide-react';
import BookCover from './BookCover';
import './ShelfCreationModal.css';

interface ShelfCreationModalProps {
  books: Book[];
  onClose: () => void;
  onConfirm: (name: string, selectedBookIds: string[]) => void;
}

const ShelfCreationModal: React.FC<ShelfCreationModalProps> = ({ 
  books, onClose, onConfirm 
}) => {
  const [name, setName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredBooks = useMemo(() => {
    return books.filter(b => !b.isDeleted && (
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.author.toLowerCase().includes(searchQuery.toLowerCase())
    ));
  }, [books, searchQuery]);

  const toggleBook = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleConfirm = () => {
    if (name.trim()) {
      onConfirm(name.trim(), Array.from(selectedIds));
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="shelf-creation-modal" onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Nueva Estantería</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="modal-body">
          <div className="input-group">
            <label>Nombre de la estantería</label>
            <input 
              type="text" 
              placeholder="Ej: Favoritos de Ciencia Ficción" 
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              className="shelf-name-input"
            />
          </div>

          <div className="books-selection-section">
            <label>Seleccionar libros (opcional)</label>
            <div className="modal-search">
              <Search size={16} />
              <input 
                type="text" 
                placeholder="Buscar libros..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="books-grid-mini">
              {filteredBooks.map(book => (
                <div 
                  key={book.id} 
                  className={`book-item-mini ${selectedIds.has(book.id) ? 'selected' : ''}`}
                  onClick={() => toggleBook(book.id)}
                >
                  <div className="book-item-mini-cover">
                    <BookCover src={book.coverImage} alt={book.title} path={book.path} />
                    {selectedIds.has(book.id) && (
                      <div className="check-overlay">
                        <Check size={16} color="white" />
                      </div>
                    )}
                  </div>
                  <div className="book-item-mini-info">
                    <span className="mini-title">{book.title}</span>
                    <span className="mini-author">{book.author}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button 
            className="btn-confirm" 
            onClick={handleConfirm} 
            disabled={!name.trim()}
          >
            Crear estantería {selectedIds.size > 0 ? `con ${selectedIds.size} libros` : ''}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default ShelfCreationModal;
