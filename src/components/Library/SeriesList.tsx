import React from 'react';
import { Series, Book } from '../../types';
import { Layers } from 'lucide-react';
import BookCover from './BookCover';
import './SeriesList.css';

interface SeriesListProps {
  series: Series[];
  books: Book[];
  onSeriesClick: (id: string) => void;
}

const SeriesList: React.FC<SeriesListProps> = ({ series, books, onSeriesClick }) => {
  const getSeriesBooks = (seriesId: string) =>
    books.filter(b => b.seriesId === seriesId && !b.isDeleted);

  if (series.length === 0) {
    return (
      <div className="series-list-empty">
        <Layers size={48} opacity={0.3} />
        <p>No hay series detectadas.</p>
        <p className="series-list-hint">Importa una carpeta que contenga subcarpetas de cómics para detectar series automáticamente.</p>
      </div>
    );
  }

  return (
    <div className="series-grid-view">
      {series.map(s => {
        const seriesBooks = getSeriesBooks(s.id).slice(0, 4);
        const count = getSeriesBooks(s.id).length;

        return (
          <div key={s.id} className="series-card" onClick={() => onSeriesClick(s.id)}>
            <div className="series-card-visual">
              {seriesBooks.length > 0 ? (
                <div className={`covers-grid count-${seriesBooks.length}`}>
                  {seriesBooks.map(book => (
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
                  <Layers size={40} />
                </div>
              )}
            </div>
            <div className="series-card-info">
              <h3 className="series-card-name">{s.name}</h3>
              <p className="series-card-count">{count} {count === 1 ? 'libro' : 'libros'}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default SeriesList;
