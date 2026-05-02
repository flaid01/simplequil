import React from 'react';
import { Shelf, Book } from '../../types';
import { Folder, Trash2 } from 'lucide-react';
import BookCover from './BookCover';
import './ShelvesList.css';

interface ShelvesListProps {
  shelves: Shelf[];
  books: Book[];
  onShelfClick: (id: string) => void;
  onDeleteShelf: (id: string) => void;
}

const ShelvesList: React.FC<ShelvesListProps> = ({ 
  shelves, books, onShelfClick, onDeleteShelf 
}) => {
  const getBookCount = (shelfId: string) => {
    return books.filter(b => b.shelfId === shelfId && !b.isDeleted).length;
  };

  const getShelfBooks = (shelfId: string) => {
    return books
      .filter(b => b.shelfId === shelfId && !b.isDeleted)
      .slice(0, 4);
  };

  if (shelves.length === 0) {
    return (
      <div className="shelves-list-empty">
        <Folder size={48} opacity={0.3} />
        <p>Aún no tienes estanterías creadas.</p>
      </div>
    );
  }

  return (
    <div className="shelves-grid-view">
      {shelves.map(shelf => {
        const shelfBooks = getShelfBooks(shelf.id);
        const count = getBookCount(shelf.id);
        
        return (
          <div key={shelf.id} className="shelf-card" onClick={() => onShelfClick(shelf.id)}>
            <div className="shelf-card-visual">
              {shelfBooks.length > 0 ? (
                <div className={`covers-grid count-${shelfBooks.length}`}>
                  {shelfBooks.map((book) => (
                    <BookCover 
                      key={book.id} 
                      src={book.coverImage} 
                      alt={book.title} 
                      path={book.path} 
                      className="shelf-cover-grid-item" 
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-shelf-visual">
                  <Folder size={40} />
                </div>
              )}
              <button 
                className="delete-shelf-card-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteShelf(shelf.id);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="shelf-card-info">
              <h3 className="shelf-card-name">{shelf.name}</h3>
              <p className="shelf-card-count">{count} {count === 1 ? 'libro' : 'libros'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ShelvesList;
