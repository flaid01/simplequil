import React, { useState } from 'react';
import { Shelf } from '../../types';
import { X, Plus, Folder } from 'lucide-react';
import './ShelfSelectorModal.css';

interface ShelfSelectorModalProps {
  shelves: Shelf[];
  onClose: () => void;
  onSelectShelf: (id: string) => void;
  onCreateShelf: (name: string) => Promise<string | undefined>;
}

const ShelfSelectorModal: React.FC<ShelfSelectorModalProps> = ({ 
  shelves, onClose, onSelectShelf, onCreateShelf 
}) => {
  const [newShelfName, setNewShelfName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (newShelfName.trim()) {
      const id = await onCreateShelf(newShelfName);
      if (id) {
        onSelectShelf(id);
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="shelf-selector-modal" onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Mover a estantería</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="modal-body">
          <div className="shelves-list">
            <button 
              className="shelf-item" 
              onClick={() => onSelectShelf('all')}
            >
              <Folder size={18} />
              <span>Sin estantería (Todos)</span>
            </button>
            
            {shelves.map(shelf => (
              <button 
                key={shelf.id} 
                className="shelf-item"
                onClick={() => onSelectShelf(shelf.id)}
              >
                <Folder size={18} />
                <span>{shelf.name}</span>
              </button>
            ))}
          </div>

          <div className="create-shelf-section">
            {!isCreating ? (
              <button className="btn-add-shelf" onClick={() => setIsCreating(true)}>
                <Plus size={18} />
                <span>Crear nueva estantería</span>
              </button>
            ) : (
              <div className="create-shelf-input">
                <input 
                  type="text" 
                  placeholder="Nombre de la estantería..." 
                  value={newShelfName}
                  onChange={e => setNewShelfName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <div className="create-actions">
                  <button className="btn-cancel" onClick={() => setIsCreating(false)}>Cancelar</button>
                  <button className="btn-confirm" onClick={handleCreate} disabled={!newShelfName.trim()}>Crear y Mover</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShelfSelectorModal;
