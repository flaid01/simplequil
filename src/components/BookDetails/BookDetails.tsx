import React, { useState, useEffect, useRef } from 'react';
import { Book } from '../../types';
import { ArrowLeft, BookOpen, Heart, Calendar, FileText, Globe, Image as ImageIcon, Headphones } from 'lucide-react';
import BookGallery from '../BookGallery/BookGallery';
import AudiobookExportModal from '../AudiobookExport/AudiobookExportModal';
import BookCover from '../Library/BookCover';
import './BookDetails.css';

interface BookDetailsProps {
  book: Book;
  onClose: () => void;
  onRead: (book: Book) => void;
  onToggleFavorite: (id: string) => void;
}

const BookDetails: React.FC<BookDetailsProps> = ({ book, onClose, onRead, onToggleFavorite }) => {
  const [showGallery, setShowGallery] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const firstButton = containerRef.current?.querySelector('button');
    if (firstButton) (firstButton as HTMLButtonElement).focus();
  }, []);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showGallery || showExportModal) return;

    const buttons = containerRef.current?.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    if (!buttons) return;

    const currentIndex = Array.from(buttons).indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % buttons.length;
      buttons[nextIndex].focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + buttons.length) % buttons.length;
      buttons[prevIndex].focus();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="book-details-overlay" onKeyDown={handleKeyDown}>
      <div className="book-details-container" ref={containerRef}>
        <header className="details-header">
          <button className="details-back-btn" onClick={onClose} title="Cerrar (Esc)">
            <ArrowLeft size={24} />
            <span>Volver a la Biblioteca</span>
          </button>
        </header>

        <main className="details-content">
          <aside className="details-sidebar">
            <div className="details-cover-container">
              <BookCover 
                src={book.coverImage} 
                alt={book.title} 
                path={book.path} 
                className="details-cover" 
              />
            </div>
            
            <div className="details-actions">
              <button className="btn-primary" onClick={() => onRead(book)}>
                <BookOpen size={20} />
                <span>Leer ahora</span>
              </button>

              <button className="btn-secondary" onClick={() => setShowGallery(true)}>
                <ImageIcon size={20} />
                <span>Ver imágenes</span>
              </button>

              <button 
                className={`btn-secondary ${book.isFavorite ? 'active' : ''}`}
                onClick={() => onToggleFavorite(book.id)}
              >
                <Heart size={20} fill={book.isFavorite ? 'currentColor' : 'none'} />
                <span>{book.isFavorite ? 'Favorito' : 'Añadir a favoritos'}</span>
              </button>

              <div className="details-divider" />

              <button className="btn-secondary export-btn" onClick={() => setShowExportModal(true)}>
                <Headphones size={20} />
                <span>Exportar Audiolibro</span>
              </button>
            </div>
          </aside>

          <section className="details-main">
            <h1 className="details-title">{book.title}</h1>
            <h2 className="details-author">{book.author}</h2>
            
            <div className="details-metadata">
              <div className="meta-item">
                <Calendar size={20} />
                <small>Añadido el</small>
                <span>{formatDate(book.dateAdded)}</span>
              </div>
              <div className="meta-item">
                <FileText size={20} />
                <small>Formato</small>
                <span>{book.fileType.toUpperCase()}</span>
              </div>
              <div className="meta-item path-item">
                <Globe size={20} />
                <small>Ubicación</small>
                <span className="path-text" title={book.path}>{book.path}</span>
              </div>
              {book.language && (
                <div className="meta-item">
                  <Globe size={20} />
                  <small>Idioma</small>
                  <span>{book.language.toUpperCase()}</span>
                </div>
              )}
            </div>

            <div className="details-progress-section">
              <div className="progress-info">
                <span>Tu progreso</span>
                <span>{book.progress}% completado</span>
              </div>
              <div className="progress-bar-container">
                <div 
                  className="progress-bar" 
                  style={{ width: `${book.progress}%` }}
                />
              </div>
            </div>

            <div className="details-synopsis" tabIndex={0}>
              <h3>Sinopsis</h3>
              <p>
                {book.synopsis || "No hay una sinopsis disponible para este libro."}
              </p>
            </div>
          </section>
        </main>
      </div>

      {showGallery && (
        <BookGallery 
          book={book} 
          onClose={() => setShowGallery(false)} 
        />
      )}

      {showExportModal && (
        <AudiobookExportModal 
          book={book} 
          onClose={() => setShowExportModal(false)} 
        />
      )}
    </div>
  );
};

export default BookDetails;
