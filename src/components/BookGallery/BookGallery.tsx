import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { join } from '@tauri-apps/api/path';
import { X, Download, Loader2, Image as ImageIcon, RotateCw, ZoomIn, ZoomOut, Info, Copy } from 'lucide-react';
import { Book } from '../../types';
import './BookGallery.css';

interface BookGalleryProps {
  book: Book;
  onClose: () => void;
}

interface BookResource {
  data: string;
  mime: string;
}

const BookGallery: React.FC<BookGalleryProps> = ({ book, onClose }) => {
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [imagesData, setImagesData] = useState<Record<string, string>>({});

  // Expanded Image States
  const [expandedImage, setExpandedImage] = useState<{
    src: string;
    width: number;
    height: number;
    mime: string;
    size: string;
  } | null>(null);
  const [imgZoom, setImgZoom] = useState(1);
  const [imgRotation, setImgRotation] = useState(0);
  const [imgPosition, setImgPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const fetchImageList = async () => {
      try {
        const paths = await invoke<string[]>('get_book_image_list', {
          path: book.path,
          fileType: book.fileType
        });
        setImagePaths(paths);
        setLoading(false);
        
        // Load first few images immediately
        for (const path of paths.slice(0, 10)) {
          loadImage(path);
        }
      } catch (error) {
        console.error('Error fetching image list:', error);
        setLoading(false);
      }
    };

    fetchImageList();
  }, [book.path, book.fileType]);

  const loadImage = async (internalPath: string) => {
    if (imagesData[internalPath]) return imagesData[internalPath];
    
    try {
      const resource = await invoke<BookResource>('get_book_resource', {
        path: book.path,
        fileType: book.fileType,
        internalPath
      });
      const dataUrl = `data:${resource.mime};base64,${resource.data}`;
      setImagesData(prev => ({
        ...prev,
        [internalPath]: dataUrl
      }));
      return dataUrl;
    } catch (error) {
      console.error(`Error loading image ${internalPath}:`, error);
      return null;
    }
  };

  const handleImageClick = async (path: string) => {
    const src = await loadImage(path);
    if (!src) return;

    // Get metadata reliably
    const img = new Image();
    const dimensions = await new Promise<{w: number, h: number}>((resolve) => {
      img.onload = () => resolve({w: img.naturalWidth, h: img.naturalHeight});
      img.onerror = () => resolve({w: 0, h: 0});
      img.src = src;
    });

    let mime = 'image/unknown', size = 'Unknown';
    if (src.startsWith('data:')) {
      const parts = src.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      if (mimeMatch) mime = mimeMatch[1];
      
      const base64Length = parts[1].length;
      const bytes = Math.floor((base64Length * 3) / 4);
      size = bytes > 1024 * 1024 
        ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` 
        : `${(bytes / 1024).toFixed(2)} KB`;
    }

    setExpandedImage({ src, width: dimensions.w, height: dimensions.h, mime, size });
    setImgZoom(1);
    setImgRotation(0);
    setImgPosition({ x: 0, y: 0 });
  };

  const handleImageMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - imgPosition.x, y: e.clientY - imgPosition.y });
  };

  const handleImageMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setImgPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleImageMouseUp = () => {
    setIsDragging(false);
  };

  const handleImageCopy = async () => {
    if (!expandedImage) return;
    try {
      const response = await fetch(expandedImage.src);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
    } catch (err) {
      console.error('Failed to copy image:', err);
    }
  };

  const handleZoom = (delta: number) => {
    setImgZoom(prev => Math.min(10, Math.max(0.1, prev + delta)));
  };

  const handleRotate = () => {
    setImgRotation(prev => (prev + 90) % 360);
  };

  const handleExport = async () => {
    try {
      const baseDir = await open({
        directory: true,
        multiple: false,
        title: 'Seleccionar carpeta de destino'
      });

      if (!baseDir || Array.isArray(baseDir)) return;

      setExporting(true);
      
      // Create a specific folder path for the book images
      const folderName = `${book.title} images`;
      const exportPath = await join(baseDir, folderName);
      
      // Call backend to do all the work
      const result = await invoke<number>('export_all_book_images', {
        path: book.path,
        fileType: book.fileType,
        targetDir: exportPath
      });
      
      alert(`Éxito: Se exportaron ${result} imágenes.\nLas imágenes se guardaron en:\n${exportPath}`);
    } catch (error) {
      console.error('Error during export:', error);
      alert('Error durante la exportación: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="book-gallery-overlay">
      <div className="book-gallery-container">
        <header className="gallery-header">
          <div className="gallery-title-area">
            <ImageIcon size={24} />
            <h2>Imágenes de {book.title}</h2>
          </div>
          <div className="gallery-actions">
            <button 
              className="btn-export" 
              onClick={handleExport}
              disabled={exporting || imagePaths.length === 0}
            >
              {exporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
              <span>{exporting ? 'Exportando...' : 'Exportar todas'}</span>
            </button>
            <button className="btn-close" onClick={onClose}>
              <X size={24} />
            </button>
          </div>
        </header>

        <div className="gallery-content">
          {loading ? (
            <div className="gallery-loading">
              <Loader2 className="animate-spin" size={48} />
              <p>Cargando lista de imágenes...</p>
            </div>
          ) : imagePaths.length === 0 ? (
            <div className="gallery-empty">
              <p>No se encontraron imágenes en este libro.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {imagePaths.map((path) => (
                <div 
                  key={path} 
                  className="gallery-item" 
                  onMouseEnter={() => loadImage(path)}
                  onClick={() => handleImageClick(path)}
                >
                  {imagesData[path] ? (
                    <img src={imagesData[path]} alt={path} loading="lazy" />
                  ) : (
                    <div className="gallery-placeholder">
                      <ImageIcon size={32} />
                      <span>{path.split('/').pop()}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <footer className="gallery-footer">
          <span>{imagePaths.length} imágenes encontradas</span>
        </footer>
      </div>

      {expandedImage && (
        <div 
          className="expanded-image-overlay" 
          onClick={() => setExpandedImage(null)}
          onMouseMove={handleImageMouseMove}
          onMouseUp={handleImageMouseUp}
          onMouseLeave={handleImageMouseUp}
          style={{ zIndex: 3000 }} // Ensure it's above the gallery overlay
        >
          <div className="expanded-image-controls" onClick={(e) => e.stopPropagation()}>
            <button className="ctrl-btn" onClick={handleImageCopy} title="Copy Image"><Copy size={20} /></button>
            <div className="ctrl-divider" />
            <button className="ctrl-btn" onClick={() => handleZoom(0.2)} title="Zoom In"><ZoomIn size={20} /></button>
            <button className="ctrl-btn" onClick={() => handleZoom(-0.2)} title="Zoom Out"><ZoomOut size={20} /></button>
            <button className="ctrl-btn" onClick={handleRotate} title="Rotate"><RotateCw size={20} /></button>
            <div className="ctrl-divider" />
            <button className="ctrl-btn close" onClick={() => setExpandedImage(null)} title="Close"><X size={20} /></button>
          </div>

          <div className="expanded-image-info" onClick={(e) => e.stopPropagation()}>
            <div className="info-item"><Info size={14} /> <span>{expandedImage.width} × {expandedImage.height} px</span></div>
            <div className="info-item"><span>{expandedImage.mime} · {expandedImage.size}</span></div>
          </div>

          <div className="image-scroll-container">
            <img 
              src={expandedImage.src} 
              alt="Expanded" 
              onMouseDown={handleImageMouseDown}
              style={{ 
                transform: `translate(${imgPosition.x}px, ${imgPosition.y}px) scale(${imgZoom}) rotate(${imgRotation}deg)`,
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0.2, 1)',
                cursor: isDragging ? 'grabbing' : 'grab'
              }} 
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BookGallery;
