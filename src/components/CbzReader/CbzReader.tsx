import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Settings, Columns, Rows, X, Maximize, Minimize } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Book, ThemeType } from '../../types';
import './CbzReader.css';

interface CbzReaderProps {
  book: Book;
  onClose: () => void;
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  onProgressUpdate?: (id: string, progress: number) => void;
}

interface EpubResource {
  data: string;
  mime: string;
}

type ReadingMode = 'ltr' | 'rtl' | 'vertical';

const CbzReader: React.FC<CbzReaderProps> = ({ book, onClose, theme, setTheme, onProgressUpdate }) => {
  const [images, setImages] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pagesData, setPagesData] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Settings state
  const [readingMode, setReadingMode] = useState<ReadingMode>('ltr');
  const [isDoublePage, setIsDoublePage] = useState(true);
  const [showGap, setShowGap] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);

  // Initialize index from progress
  useEffect(() => {
    if (images.length > 0 && book.progress > 0) {
      const savedIndex = Math.floor((book.progress / 100) * images.length);
      // Ensure we don't go out of bounds
      const safeIndex = Math.max(0, Math.min(savedIndex, images.length - 1));
      setCurrentIndex(safeIndex);
    }
  }, [images.length]); // Only run when images list is first loaded

  // Report progress updates
  useEffect(() => {
    if (images.length > 0 && onProgressUpdate) {
      const rawProgress = ((currentIndex + 1) / images.length) * 100;
      const progress = Math.round(rawProgress * 100) / 100;
      onProgressUpdate(book.id, progress);
    }
  }, [currentIndex, images.length]);

  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const loadImages = useCallback(async () => {
    try {
      const list = await invoke('get_book_image_list', { 
        path: book.path, 
        fileType: 'cbz' 
      }) as string[];
      setImages(list);
      setLoading(false);
    } catch (err) {
      setError('Error al cargar las imágenes del comic');
      setLoading(false);
    }
  }, [book.path]);

  const loadPage = useCallback(async (index: number) => {
    if (index < 0 || index >= images.length || pagesData[index]) return;
    
    try {
      const resource = await invoke('get_book_resource', {
        path: book.path,
        fileType: 'cbz',
        internalPath: images[index]
      }) as EpubResource;
      const dataUrl = `data:${resource.mime};base64,${resource.data}`;
      setPagesData(prev => ({ ...prev, [index]: dataUrl }));
    } catch (err) {
      console.error('Failed to load page:', err);
    }
  }, [book.path, images, pagesData]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // Preload current and next pages
  useEffect(() => {
    if (images.length > 0) {
      loadPage(currentIndex);
      if (isDoublePage) loadPage(currentIndex + 1);
      // Preload ahead
      loadPage(currentIndex + 2);
    }
  }, [images, currentIndex, isDoublePage, loadPage]);

  const handleNext = useCallback(() => {
    const step = (isDoublePage && readingMode !== 'vertical') ? 2 : 1;
    if (currentIndex + step < images.length) {
      setCurrentIndex(prev => prev + step);
    } else if (currentIndex < images.length - 1) {
      setCurrentIndex(images.length - 1);
    }
  }, [currentIndex, images.length, isDoublePage, readingMode]);

  const handlePrev = useCallback(() => {
    const step = (isDoublePage && readingMode !== 'vertical') ? 2 : 1;
    if (currentIndex - step >= 0) {
      setCurrentIndex(prev => prev - step);
    } else if (currentIndex > 0) {
      setCurrentIndex(0);
    }
  }, [currentIndex, isDoublePage, readingMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (readingMode === 'vertical') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          contentRef.current?.scrollBy({ top: 200, behavior: 'smooth' });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          contentRef.current?.scrollBy({ top: -200, behavior: 'smooth' });
        }
      } else {
        if (e.key === 'ArrowRight') readingMode === 'rtl' ? handlePrev() : handleNext();
        if (e.key === 'ArrowLeft') readingMode === 'rtl' ? handleNext() : handlePrev();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images.length, onClose, readingMode, handleNext, handlePrev]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const threshold = 80; // Pixels from top/bottom to trigger UI
    const isOverTop = e.clientY < threshold;
    const isOverBottom = e.clientY > window.innerHeight - threshold;

    if (isOverTop || isOverBottom || showSettings) {
      setUiVisible(true);
    } else {
      setUiVisible(false);
    }
  };

  const renderPages = () => {
    if (readingMode === 'vertical') {
      return (
        <div className="vertical-strip">
          {images.map((_, idx) => (
            <div key={idx} className="vertical-page">
              {pagesData[idx] ? (
                <img src={pagesData[idx]} alt={`Página ${idx + 1}`} onLoad={() => {
                  // Trigger load of next image when this one is loaded and visible
                  if (idx + 1 < images.length) loadPage(idx + 1);
                }} />
              ) : (
                <div className="page-placeholder">Cargando...</div>
              )}
            </div>
          ))}
        </div>
      );
    }

    const firstPage = currentIndex;
    const secondPage = isDoublePage ? currentIndex + 1 : -1;

    const pageElements = [
      <div key="p1" className="page-container">
        {pagesData[firstPage] ? (
          <img src={pagesData[firstPage]} alt={`Página ${firstPage + 1}`} />
        ) : (
          <div className="page-placeholder">Cargando...</div>
        )}
      </div>
    ];

    if (isDoublePage && secondPage < images.length && secondPage !== -1) {
      pageElements.push(
        <div key="p2" className="page-container">
          {pagesData[secondPage] ? (
            <img src={pagesData[secondPage]} alt={`Página ${secondPage + 1}`} />
          ) : (
            <div className="page-placeholder">Cargando...</div>
          )}
        </div>
      );
    }

    if (readingMode === 'rtl') pageElements.reverse();

    return <div className={`spread-container ${isDoublePage ? 'double' : 'single'} ${showGap ? 'has-gap' : ''}`}>{pageElements}</div>;
  };

  return (
    <div 
      className={`cbz-reader-container theme-${theme} mode-${readingMode} ${uiVisible ? 'ui-visible' : 'ui-hidden'}`}
      onMouseMove={handleMouseMove}
    >
      <header className="cbz-reader-header">
        <button className="back-btn" onClick={onClose}>
          <ArrowLeft size={20} />
          <span>Biblioteca</span>
        </button>
        <div className="cbz-title">{book.title}</div>
        <div className="reader-actions">
          <button 
            className="action-btn" 
            onClick={toggleFullscreen}
            title={isFullscreen ? "Salir de Pantalla Completa" : "Pantalla Completa"}
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button 
            className={`action-btn ${showSettings ? 'active' : ''}`} 
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings size={20} />
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="reader-settings-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-panel" onClick={e => e.stopPropagation()}>
            <div className="settings-header">
              <h3>Ajustes de Lectura</h3>
              <button onClick={() => setShowSettings(false)}><X size={18} /></button>
            </div>
            
            <div className="settings-section">
              <label>Modo de Visualización</label>
              <div className="toggle-group">
                <button 
                  className={!isDoublePage ? 'active' : ''} 
                  onClick={() => setIsDoublePage(false)}
                >
                  Una Página
                </button>
                <button 
                  className={isDoublePage ? 'active' : ''} 
                  onClick={() => setIsDoublePage(true)}
                >
                  Dos Páginas
                </button>
              </div>
            </div>

            {isDoublePage && readingMode !== 'vertical' && (
              <div className="settings-section">
                <label>Separación de Páginas</label>
                <div className="toggle-group">
                  <button 
                    className={!showGap ? 'active' : ''} 
                    onClick={() => setShowGap(false)}
                  >
                    Sin Espacio
                  </button>
                  <button 
                    className={showGap ? 'active' : ''} 
                    onClick={() => setShowGap(true)}
                  >
                    Con Espacio
                  </button>
                </div>
              </div>
            )}

            <div className="settings-section">
              <label>Dirección de Lectura</label>
              <div className="mode-options">
                <button 
                  className={readingMode === 'ltr' ? 'active' : ''} 
                  onClick={() => setReadingMode('ltr')}
                  title="Izquierda a Derecha"
                >
                  <Columns size={20} />
                  <span>Normal</span>
                </button>
                <button 
                  className={readingMode === 'rtl' ? 'active' : ''} 
                  onClick={() => setReadingMode('rtl')}
                  title="Derecha a Izquierda (Manga)"
                >
                  <Columns size={20} style={{ transform: 'scaleX(-1)' }} />
                  <span>Manga</span>
                </button>
                <button 
                  className={readingMode === 'vertical' ? 'active' : ''} 
                  onClick={() => setReadingMode('vertical')}
                  title="Tira Vertical"
                >
                  <Rows size={20} />
                  <span>Vertical</span>
                </button>
              </div>
            </div>

            <div className="settings-section">
              <label>Tema</label>
              <div className="theme-options">
                <button 
                  className={`theme-btn light ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                  title="Claro"
                />
                <button 
                  className={`theme-btn sepia ${theme === 'sepia' ? 'active' : ''}`}
                  onClick={() => setTheme('sepia')}
                  title="Sepia"
                />
                <button 
                  className={`theme-btn dark ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                  title="Oscuro"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="cbz-content" ref={contentRef}>
        {loading ? (
          <div className="loading">Cargando comic...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : (
          renderPages()
        )}
        
        {readingMode !== 'vertical' && (
          <>
            <div className="nav-zone prev" onClick={readingMode === 'rtl' ? handleNext : handlePrev} />
            <div className="nav-zone next" onClick={readingMode === 'rtl' ? handlePrev : handleNext} />
          </>
        )}
      </main>

      <footer className="cbz-reader-footer">
        <div className="page-info">
          Página {currentIndex + 1} {isDoublePage && currentIndex + 1 < images.length ? `& ${currentIndex + 2}` : ''} de {images.length}
        </div>
        <div className="progress-slider-container">
          <input 
            type="range" 
            min="0" 
            max={images.length - 1} 
            value={currentIndex} 
            onChange={(e) => {
              const val = parseInt(e.target.value);
              // In double page mode, we should ideally snap to even/odd starts 
              // but let's just jump to exactly where the user drags for now.
              setCurrentIndex(val);
            }} 
            className="cbz-progress-slider" 
          />
        </div>
      </footer>
    </div>
  );
};

export default CbzReader;
