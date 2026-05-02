import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Book } from '../../types';
import './PdfReader.css';

interface PdfReaderProps {
  book: Book;
  onClose: () => void;
}

const PdfReader: React.FC<PdfReaderProps> = ({ book, onClose }) => {
  const pdfUrl = convertFileSrc(book.path);

  return (
    <div className="pdf-reader-container">
      <header className="pdf-reader-header">
        <button className="back-btn" onClick={onClose} title="Volver a la Biblioteca (Esc)">
          <ArrowLeft size={20} />
          <span>Biblioteca</span>
        </button>
        <div className="pdf-title">{book.title}</div>
        <div className="header-actions">
          {/* Most of these are handled by the browser's built-in PDF viewer, 
              but we keep the header consistent with the app style */}
        </div>
      </header>
      
      <main className="pdf-content">
        <iframe 
          src={`${pdfUrl}#toolbar=1&navpanes=1&view=FitH`}
          title={book.title}
          className="pdf-frame"
        />
      </main>
    </div>
  );
};

export default PdfReader;
