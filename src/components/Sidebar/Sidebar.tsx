import {
  Library,
  History,
  Heart,
  Files,
  Plus,
  BookOpen,
  Trash2,
  Settings,
  HelpCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Folders,
  CheckCircle,
} from 'lucide-react';
import { Shelf } from '../../types';
import './Sidebar.css';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface SidebarProps {
  onCategoryChange: (category: string) => void;
  activeCategory: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  shelves: Shelf[];
  onDeleteShelf: (id: string) => void;
  onCreateShelf: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  onCategoryChange,
  activeCategory,
  isCollapsed = false,
  onToggleCollapse,
  onCreateShelf,
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const navItems = [
    { id: 'all', icon: <Library size={18} />, label: t('sidebar.all') },
    { id: 'recent', icon: <History size={18} />, label: t('sidebar.recent') },
    { id: 'favorites', icon: <Heart size={18} />, label: t('sidebar.favorites') },
  ];

  const readingSections = [
    { id: 'reading', icon: <BookOpen size={18} />, label: t('sidebar.reading') },
    { id: 'read', icon: <CheckCircle size={18} />, label: t('sidebar.read') },
    { id: 'deleted', icon: <Trash2 size={18} />, label: t('sidebar.deleted') },
  ];

  const formats = ['all', 'epub', 'pdf', 'cbz', 'mobi'];
  
  const handleFormatClick = () => {
    const currentIndex = formats.indexOf(activeCategory);
    const nextIndex = (currentIndex + 1) % formats.length;
    const nextFormat = currentIndex === -1 ? 'epub' : formats[nextIndex];
    onCategoryChange(nextFormat);
  };

  const getFormatLabel = () => {
    if (activeCategory === 'all') return t('sidebar.formats_all');
    if (formats.includes(activeCategory)) {
      return t('sidebar.format_label', { format: activeCategory.toUpperCase() });
    }
    return t('sidebar.formats');
  };

  // Keyboard navigation within sidebar
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = sidebarRef.current?.querySelectorAll('.nav-item') as NodeListOf<HTMLButtonElement>;
    if (!items) return;

    const currentIndex = Array.from(items).indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % items.length;
      items[nextIndex].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + items.length) % items.length;
      items[prevIndex].focus();
    }
  };

  return (
    <aside 
      className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} 
      ref={sidebarRef}
      onKeyDown={handleKeyDown}
    >
      <div className="sidebar-header">
        {!isCollapsed && <div className="sidebar-logo">SimpleQuill</div>}
        <button className="collapse-toggle" onClick={onToggleCollapse} title="Toggle Sidebar (Ctrl+B)">
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <div className="sidebar-top">
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeCategory === item.id ? 'active' : ''}`}
              onClick={() => onCategoryChange(item.id)}
              title={isCollapsed ? item.label : ''}
            >
              {item.icon}
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-section">
          {!isCollapsed && <div className="section-title">FILTROS</div>}
          <button
            className={`nav-item ${formats.includes(activeCategory) && activeCategory !== 'all' ? 'active' : ''}`}
            onClick={handleFormatClick}
            title={isCollapsed ? getFormatLabel() : ''}
          >
            <Files size={18} />
            {!isCollapsed && <span>{getFormatLabel()}</span>}
          </button>
        </div>

        <div className="sidebar-section">
          {!isCollapsed && <div className="section-title">ESTANTERÍAS</div>}

          <button
            className={`nav-item ${activeCategory === 'shelves_list' ? 'active' : ''}`}
            onClick={() => onCategoryChange('shelves_list')}
            title={isCollapsed ? 'Mis estanterías' : ''}
          >
            <Folders size={18} />
            {!isCollapsed && <span>Mis estanterías</span>}
          </button>

          <button className="nav-item add-category" title={isCollapsed ? 'Agregar nueva estantería' : ''} onClick={onCreateShelf}>
            <Plus size={18} />
            {!isCollapsed && <span>Nueva estantería</span>}
          </button>
        </div>

        <div className="sidebar-section">
          {readingSections.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeCategory === item.id ? 'active' : ''}`}
              onClick={() => onCategoryChange(item.id)}
              title={isCollapsed ? item.label : ''}
            >
              {item.icon}
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="sidebar-bottom">
        <button 
          className={`nav-item ${activeCategory === 'settings' ? 'active' : ''}`}
          onClick={() => onCategoryChange('settings')}
          title={isCollapsed ? 'Settings' : ''}
        >
          <Settings size={18} />
          {!isCollapsed && <span>Settings</span>}
        </button>
        <button className="nav-item" title={isCollapsed ? 'Help' : ''}>
          <HelpCircle size={18} />
          {!isCollapsed && <span>Help</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
