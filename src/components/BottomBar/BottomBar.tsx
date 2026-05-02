import React from 'react';
import { Play } from 'lucide-react';
import { Book } from '../../types';
import BookCover from '../Library/BookCover';
import './BottomBar.css';

interface BottomBarProps {
  currentBook?: Book;
  onRead?: (book: Book) => void;
}

const BottomBar: React.FC<BottomBarProps> = ({ currentBook, onRead }) => {
  if (!currentBook) return null;

  return (
    <footer className="bottombar">
      <div className="current-book-info">
        <BookCover 
          src={currentBook.coverImage} 
          alt={currentBook.title} 
          path={currentBook.path} 
          className="mini-cover" 
        />
        <div className="text-info">
          <span className="current-title">{currentBook.title}</span>
          <span className="current-progress">Posición: {currentBook.progress}%</span>
        </div>
      </div>

      <button className="resume-btn" onClick={() => onRead?.(currentBook)}>
        <Play size={16} fill="currentColor" />
        <span>Continuar leyendo</span>
      </button>
    </footer>
  );
};

export default BottomBar;
