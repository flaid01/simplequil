import React from 'react';
import { Book } from '../../types';
import BookCover from '../Library/BookCover';
import './BookCard.css';

interface BookCardProps {
  book: Book;
  viewMode: 'grid' | 'list';
  isSelected?: boolean;
}

const BookCard: React.FC<BookCardProps> = ({ book, viewMode, isSelected }) => {
  return (
    <div className={`book-card ${viewMode} ${isSelected ? 'selected' : ''}`}>
      <div className="book-cover-container">
        <BookCover 
          src={book.coverImage} 
          alt={book.title} 
          path={book.path} 
          className="book-cover" 
        />
        <div className="progress-overlay">
          <div className="progress-bar-container">
            <div 
              className="progress-bar" 
              style={{ width: `${book.progress}%` }}
            />
          </div>
          <span className="progress-text">{book.progress}%</span>
        </div>
      </div>
      
      <div className="book-info">
        <h3 className="book-title" title={book.title}>{book.title}</h3>
        <p className="book-author">{book.author}</p>
      </div>
    </div>
  );
};

export default BookCard;
