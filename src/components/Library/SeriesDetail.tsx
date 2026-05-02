import React, { useState, useMemo, useEffect } from 'react';
import { Series, Book } from '../../types';
import BookCover from './BookCover';
import { 
  ArrowLeft, 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Heart, 
  MoreVertical, 
  Folder, 
  CheckSquare, 
  Info, 
  CheckCircle2,
  Settings,
  GripVertical,
  Save,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import './SeriesDetail.css';

interface SeriesDetailProps {
  series: Series;
  chapters: Book[];
  onClose: () => void;
  onReadChapter: (book: Book) => void;
  onToggleFavorite?: (id: string) => void;
  onMarkAllRead?: (seriesId: string, read: boolean) => void;
  onReorderChapters?: (orderedIds: string[]) => void;
  onUpdateSeriesName?: (id: string, newName: string) => void;
  onUpdateSeriesAuthor?: (id: string, newAuthor: string) => void;
  onUpdateSeriesSynopsis?: (id: string, newSynopsis: string) => void;
  onUpdateSeriesCover?: (id: string, newCover: string) => void;
  onDeleteSeries?: (id: string) => void;
}

const SeriesDetail: React.FC<SeriesDetailProps> = ({ 
  series, 
  chapters = [], 
  onClose, 
  onReadChapter,
  onToggleFavorite,
  onMarkAllRead,
  onReorderChapters,
  onUpdateSeriesName,
  onUpdateSeriesAuthor,
  onUpdateSeriesSynopsis,
  onUpdateSeriesCover,
  onDeleteSeries
}) => {
  // 1. State
  const [sortDesc, setSortDesc] = useState(true);
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<Book[]>([]);
  const [editedName, setEditedName] = useState(series.name);
  const [editedAuthor, setEditedAuthor] = useState(series.author || '');
  const [editedSynopsis, setEditedSynopsis] = useState(series.synopsis || '');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // 2. Memos
  const sortedChapters = useMemo(() =>
    [...chapters].sort((a, b) => {
      const va = a.volumeNumber ?? 0;
      const vb = b.volumeNumber ?? 0;
      return sortDesc ? vb - va : va - vb;
    }),
    [chapters, sortDesc]
  );

  const coverChapter = useMemo(() => {
    if (chapters.length === 0) return null;
    return [...chapters].sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0))[0];
  }, [chapters]);

  const continueChapter = useMemo(() => {
    if (chapters.length === 0) return null;
    const inProgress = chapters
      .filter(c => c.progress > 0 && c.progress < 100)
      .sort((a, b) => b.lastOpened - a.lastOpened);
    if (inProgress.length > 0) return inProgress[0];
    return [...chapters]
      .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0))
      .find(c => c.progress === 0) ?? chapters[0] ?? null;
  }, [chapters]);

  const readCount = useMemo(() => chapters.filter(c => c.progress >= 100).length, [chapters]);
  const isFavorite = useMemo(() => chapters.some(c => c.isFavorite), [chapters]);
  const allRead = useMemo(() => chapters.length > 0 && readCount === chapters.length, [chapters, readCount]);

  const continueLabel = useMemo(() => {
    if (continueChapter && continueChapter.progress > 0 && continueChapter.progress < 100) {
      return `Continuar - Cap. ${continueChapter.volumeNumber || ''}`;
    }
    return allRead ? 'Releer' : 'Leer';
  }, [continueChapter, allRead]);

  const seriesCover = series.coverImage || coverChapter?.coverImage;

  // 3. Effects
  useEffect(() => {
    setEditedName(series.name);
    setEditedAuthor(series.author || '');
    setEditedSynopsis(series.synopsis || '');
  }, [series]);

  // 4. Handlers
  const handleToggleEdit = () => {
    if (!isEditMode) {
      const initial = [...chapters].sort((a, b) => {
        const va = a.volumeNumber ?? 0;
        const vb = b.volumeNumber ?? 0;
        return va - vb;
      });
      setLocalOrder(initial);
      setEditedName(series.name);
      setEditedAuthor(series.author || coverChapter?.author || '');
      setEditedSynopsis(series.synopsis || coverChapter?.synopsis || '');
      setSortDesc(false);
    }
    setIsEditMode(!isEditMode);
  };

  const handleSaveAll = () => {
    if (onReorderChapters) {
      onReorderChapters(localOrder.map(b => b.id));
    }
    if (onUpdateSeriesName && editedName.trim() !== series.name) {
      onUpdateSeriesName(series.id, editedName.trim());
    }
    if (onUpdateSeriesAuthor && editedAuthor.trim() !== series.author) {
      onUpdateSeriesAuthor(series.id, editedAuthor.trim());
    }
    if (onUpdateSeriesSynopsis && editedSynopsis.trim() !== series.synopsis) {
      onUpdateSeriesSynopsis(series.id, editedSynopsis.trim());
    }
    setIsEditMode(false);
  };

  const handleOpenFolder = async () => {
    if (coverChapter?.path) {
      try {
        await revealItemInDir(coverChapter.path);
      } catch (err) {
        console.error("Failed to open folder:", err);
      }
    }
  };

  const handlePickCover = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
      });
      if (selected && typeof selected === 'string' && onUpdateSeriesCover) {
        onUpdateSeriesCover(series.id, selected);
      }
    } catch (err) {
      console.error("Failed to pick cover:", err);
    }
  };

  // 5. Render
  return (
    <motion.div 
      className="series-detail-overlay"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onClick={() => { setShowSettingsMenu(false); setShowMoreMenu(false); }}
    >
      {/* Immersive Header Background */}
      <div className="series-detail-banner-container">
        {seriesCover && (
          <div className="series-detail-banner" aria-hidden="true">
            <img src={seriesCover} alt="" className="series-banner-blur" />
            <div className="series-banner-gradient" />
          </div>
        )}
      </div>

      {/* Sticky Top Navigation */}
      <div className="series-detail-topbar">
        <button className="series-back-btn" onClick={onClose}>
          <ArrowLeft size={22} />
        </button>
        <div className="series-topbar-actions">
          <button 
            className={`series-topbar-icon-btn ${isEditMode ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); handleToggleEdit(); }}
            title="Editar serie"
          >
            <Edit3 size={20} />
          </button>
          
          <div className="menu-anchor">
            <button 
              className="series-topbar-icon-btn" 
              onClick={(e) => { e.stopPropagation(); setShowSettingsMenu(!showSettingsMenu); setShowMoreMenu(false); }}
            >
              <Settings size={20} />
            </button>
            <AnimatePresence>
              {showSettingsMenu && (
                <motion.div 
                  className="dropdown-menu settings-menu"
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                >
                  <button className="menu-item" onClick={() => setSortDesc(false)}>Ordenar: Ascendente</button>
                  <button className="menu-item" onClick={() => setSortDesc(true)}>Ordenar: Descendente</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="menu-anchor">
            <button 
              className="series-topbar-icon-btn"
              onClick={(e) => { e.stopPropagation(); setShowMoreMenu(!showMoreMenu); setShowSettingsMenu(false); }}
            >
              <MoreVertical size={20} />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div 
                  className="dropdown-menu more-menu"
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                >
                  <button className="menu-item" onClick={handlePickCover}>Cambiar portada</button>
                  <button className="menu-item" onClick={handleToggleEdit}>Editar metadatos</button>
                  <div className="menu-divider" />
                  <button 
                    className="menu-item danger" 
                    onClick={() => onDeleteSeries && onDeleteSeries(series.id)}
                  >
                    Eliminar serie
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="series-detail-scroll-content">
        <div className="series-detail-content-inner">
          {/* Main Info Header */}
          <div className="series-header-info">
            <div className="series-cover-main-wrapper">
              {seriesCover && (
                <BookCover
                  src={seriesCover}
                  alt={series.name}
                  path={coverChapter?.path || ''}
                  className="series-main-cover-img"
                />
              )}
            </div>
            <div className="series-header-text">
              {isEditMode ? (
                <>
                  <input 
                    className="series-title-input"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    placeholder="Título de la serie"
                    autoFocus
                  />
                  <input 
                    className="series-author-input"
                    value={editedAuthor}
                    onChange={(e) => setEditedAuthor(e.target.value)}
                    placeholder="Autor"
                  />
                </>
              ) : (
                <>
                  <h1 className="series-title-text">{series.name}</h1>
                  <p className="series-author-text">{series.author || coverChapter?.author || 'Autor Desconocido'}</p>
                </>
              )}
            </div>
          </div>

          {/* Action Bar */}
          <div className="series-action-bar">
            {isEditMode ? (
              <button 
                className="series-primary-read-btn save-order" 
                onClick={handleSaveAll}
              >
                <Save size={18} />
                <span>Guardar Cambios</span>
              </button>
            ) : (
              continueChapter && (
                <button 
                  className="series-primary-read-btn" 
                  onClick={() => onReadChapter(continueChapter)}
                >
                  <BookOpen size={18} />
                  <span>{continueLabel}</span>
                </button>
              )
            )}
            <div className="series-secondary-actions">
              <button 
                className={`series-action-icon-btn ${isFavorite ? 'active' : ''}`}
                onClick={() => onToggleFavorite && onToggleFavorite(coverChapter?.id || '')}
              >
                <Heart size={22} fill={isFavorite ? "currentColor" : "none"} />
                <span>{isFavorite ? 'Biblioteca' : 'Añadir'}</span>
              </button>
              <button className="series-action-icon-btn" onClick={handleOpenFolder}>
                <Folder size={22} />
                <span>Carpeta</span>
              </button>
              <button 
                className="series-action-icon-btn"
                onClick={() => onMarkAllRead && onMarkAllRead(series.id, !allRead)}
              >
                <CheckSquare size={22} />
                <span>{allRead ? 'No leídos' : 'Leídos'}</span>
              </button>
            </div>
          </div>

          {/* Synopsis & Metadata */}
          <div className="series-info-card">
            {isEditMode ? (
              <textarea 
                className="series-synopsis-input"
                value={editedSynopsis}
                onChange={(e) => setEditedSynopsis(e.target.value)}
                placeholder="Sinopsis de la serie"
              />
            ) : (
              <div 
                className={`series-synopsis-container ${isSynopsisExpanded ? 'expanded' : ''}`}
                onClick={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
              >
                <p className="series-synopsis-text">{series.synopsis || coverChapter?.synopsis || 'Sin sinopsis disponible.'}</p>
                {!isSynopsisExpanded && (series.synopsis?.length || coverChapter?.synopsis?.length || 0) > 200 && <div className="synopsis-fade" />}
              </div>
            )}
          </div>

          {/* Chapters Section */}
          <div className="series-chapters-container">
            <div className="series-chapters-header-row">
              <h2 className="chapters-count-label">
                {isEditMode ? 'Gestionar Capítulos' : `${chapters.length} Capítulos`}
                {!isEditMode && readCount > 0 && <span className="read-count-sub"> ({readCount} leídos)</span>}
              </h2>
              <div className="chapters-controls">
                {!isEditMode && (
                  <>
                    <button className="chapters-filter-btn">
                      <Info size={18} />
                    </button>
                    <button 
                      className="chapters-sort-btn" 
                      onClick={() => setSortDesc(prev => !prev)}
                    >
                      {sortDesc ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditMode ? (
              <Reorder.Group axis="y" values={localOrder} onReorder={setLocalOrder} className="chapters-list-mihon reorder-mode">
                {localOrder.map((chapter) => (
                  <Reorder.Item key={chapter.id} value={chapter} className="chapter-item-mihon is-reordering">
                    <div className="chapter-item-left">
                      <div className="chapter-item-title-row">
                        <span className="chapter-title-text-mihon">
                          Capítulo {chapter.volumeNumber || ''} {chapter.title !== series.name ? `- ${chapter.title}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="chapter-reorder-handle">
                      <GripVertical size={20} />
                    </div>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : (
              <div className="chapters-list-mihon">
                {sortedChapters.map((chapter) => {
                  const isRead = chapter.progress >= 100;
                  const isInProgress = chapter.progress > 0 && chapter.progress < 100;
                  
                  return (
                    <div 
                      key={chapter.id} 
                      className={`chapter-item-mihon ${isRead ? 'is-read' : ''} ${isInProgress ? 'is-in-progress' : ''}`}
                      onClick={() => onReadChapter(chapter)}
                    >
                      <div className="chapter-item-left">
                        <div className="chapter-item-title-row">
                          <span className="chapter-title-text-mihon">
                            Capítulo {chapter.volumeNumber || ''} {chapter.title !== series.name ? `- ${chapter.title}` : ''}
                          </span>
                        </div>
                        <div className="chapter-item-meta-row">
                          <span className="chapter-date-text">
                            {new Date(chapter.dateAdded).toLocaleDateString()}
                          </span>
                          {isInProgress && (
                            <span className="chapter-progress-text">
                              • {Math.round(chapter.progress)}% completado
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="chapter-item-right">
                        {isRead ? (
                          <CheckCircle2 size={18} className="chapter-read-icon" />
                        ) : (
                          <div className="chapter-unread-dot" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default SeriesDetail;
