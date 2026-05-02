import React, { useState } from 'react';
import { Series } from '../../types';
import { X, Plus, Layers } from 'lucide-react';
import './ShelfSelectorModal.css';

interface SeriesSelectorModalProps {
  series: Series[];
  onClose: () => void;
  onSelectSeries: (id: string | null, name: string | null) => void;
  onCreateSeries: (name: string) => Promise<string | undefined>;
}

const SeriesSelectorModal: React.FC<SeriesSelectorModalProps> = ({
  series, onClose, onSelectSeries, onCreateSeries
}) => {
  const [newSeriesName, setNewSeriesName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (newSeriesName.trim()) {
      const id = await onCreateSeries(newSeriesName.trim());
      if (id) {
        onSelectSeries(id, newSeriesName.trim());
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="shelf-selector-modal" onClick={e => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Añadir a serie</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </header>

        <div className="modal-body">
          <div className="shelves-list">
            <button className="shelf-item" onClick={() => onSelectSeries(null, null)}>
              <Layers size={18} />
              <span>Sin serie (quitar de serie)</span>
            </button>
            {series.map(s => (
              <button key={s.id} className="shelf-item" onClick={() => onSelectSeries(s.id, s.name)}>
                <Layers size={18} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>

          <div className="create-shelf-section">
            {!isCreating ? (
              <button className="btn-add-shelf" onClick={() => setIsCreating(true)}>
                <Plus size={18} />
                <span>Crear nueva serie</span>
              </button>
            ) : (
              <div className="create-shelf-input">
                <input
                  type="text"
                  placeholder="Nombre de la serie..."
                  value={newSeriesName}
                  onChange={e => setNewSeriesName(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
                <div className="create-actions">
                  <button className="btn-cancel" onClick={() => setIsCreating(false)}>Cancelar</button>
                  <button className="btn-confirm" onClick={handleCreate} disabled={!newSeriesName.trim()}>Crear y Añadir</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SeriesSelectorModal;
