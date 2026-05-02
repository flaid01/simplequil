import React from 'react';
import { 
  FilePlus, 
  FolderPlus, 
  Search, 
  LayoutGrid, 
  List, 
  ChevronDown 
} from 'lucide-react';
import { ViewMode, SortOption } from '../../types';
import './TopBar.css';

interface TopBarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sortOption: SortOption;
  setSortOption: (option: SortOption) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onImportFile: () => void;
  onImportFolder: () => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

const TopBar: React.FC<TopBarProps> = ({
  viewMode,
  setViewMode,
  sortOption,
  setSortOption,
  searchQuery,
  setSearchQuery,
  onImportFile,
  onImportFolder,
  searchInputRef,
}) => {
  const sortOptions: { value: SortOption; label: string }[] = [
    { value: 'title', label: 'Título' },
    { value: 'author', label: 'Autor' },
    { value: 'date', label: 'Fecha' },
    { value: 'notes', label: 'Notas' },
    { value: 'progress', label: 'Progreso' },
  ];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="import-btn" onClick={onImportFile}>
          <FilePlus size={18} />
          <span>Importar archivo</span>
        </button>
        <button className="import-btn" onClick={onImportFolder}>
          <FolderPlus size={18} />
          <span>Importar carpeta</span>
        </button>
      </div>

      <div className="topbar-center">
        <div className="search-container">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search bar: “”"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            ref={searchInputRef}
          />
        </div>
      </div>

      <div className="topbar-right">
        <div className="sort-container">
          <span className="sort-label">Ordenar por:</span>
          <div className="sort-dropdown">
            <span>{sortOptions.find(o => o.value === sortOption)?.label}</span>
            <ChevronDown size={14} />
            <select 
              value={sortOption} 
              onChange={(e) => setSortOption(e.target.value as SortOption)}
            >
              {sortOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="view-toggle">
          <button 
            className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid size={18} />
          </button>
          <button 
            className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            <List size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
