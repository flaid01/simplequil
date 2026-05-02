import React, { useState, useEffect } from 'react';
import { X, Headphones, Check, Clock, Sliders, Download } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { Book, SpineItem } from '../../types';
import './AudiobookExportModal.css';

interface AudiobookExportModalProps {
  book: Book;
  onClose: () => void;
}

const AudiobookExportModal: React.FC<AudiobookExportModalProps> = ({ book, onClose }) => {
  const [spine, setSpine] = useState<SpineItem[]>([]);
  const [exportRange, setExportRange] = useState<'all' | 'custom'>('all');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [voices, setVoices] = useState<string[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [speed, setSpeed] = useState<number>(1.0);
  const [pitch] = useState<number>(1.0);
  const [naturalPauses, setNaturalPauses] = useState<boolean>(true);
  const [exportLyrics, setExportLyrics] = useState<boolean>(false);
  
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Load book spine
    const loadSpine = async () => {
      try {
        const result = await invoke('get_epub_spine', { path: book.path }) as SpineItem[];
        setSpine(result);
        setSelectedChapters(result.map(s => s.id));
      } catch (err) {
        console.error('Failed to load spine:', err);
      }
    };

    // Load available voices from Piper
    const loadVoices = async () => {
      try {
        const result = await invoke('get_piper_voices') as string[];
        setVoices(result);
        if (result.length > 0) setSelectedVoice(result[0]);
      } catch (err) {
        console.error('Failed to load voices:', err);
      }
    };

    loadSpine();
    loadVoices();
  }, [book.path]);

  useEffect(() => {
    let unlisten: any;
    const setupListener = async () => {
      unlisten = await listen('export-progress', (event: any) => {
        const { percentage, status } = event.payload;
        setProgress(percentage);
        setStatus(status);
        if (percentage === 100) {
          setTimeout(() => {
            setIsExporting(false);
            setStatus('¡Exportación completada!');
          }, 1000);
        }
      });
    };
    setupListener();
    return () => { if (unlisten) unlisten(); };
  }, []);

  const toggleChapter = (id: string) => {
    setSelectedChapters(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleStartExport = async () => {
    try {
      const exportPath = await save({
        defaultPath: `${book.title}.wav`,
        filters: [{ name: 'Audio', extensions: ['wav'] }]
      });

      if (!exportPath) return;

      setIsExporting(true);
      setProgress(0);
      setStatus('Iniciando exportación...');

      await invoke('export_audiobook', {
        bookPath: book.path,
        chapters: exportRange === 'all' ? spine.map(s => s.id) : selectedChapters,
        modelName: selectedVoice,
        speed,
        pitch,
        naturalPauses,
        exportLyrics,
        outputPath: exportPath
      });

    } catch (err) {
      console.error('Export failed:', err);
      setIsExporting(false);
      setStatus('Error: ' + err);
    }
  };

  return (
    <div className="audiobook-export-overlay" onClick={onClose}>
      <div className="audiobook-export-modal" onClick={e => e.stopPropagation()}>
        <header className="export-modal-header">
          <h2><Headphones size={24} color="var(--accent-color)" /> Exportar como Audiolibro</h2>
          <button className="close-btn" onClick={onClose} disabled={isExporting}>
            <X size={20} />
          </button>
        </header>

        <div className="export-modal-content">
          <section className="settings-section">
            <h3>Rango de Exportación</h3>
            <div className="radio-group">
              <label className="radio-label">
                <input 
                  type="radio" 
                  checked={exportRange === 'all'} 
                  onChange={() => setExportRange('all')} 
                  disabled={isExporting}
                />
                Libro completo ({spine.length} capítulos)
              </label>
              <label className="radio-label">
                <input 
                  type="radio" 
                  checked={exportRange === 'custom'} 
                  onChange={() => setExportRange('custom')} 
                  disabled={isExporting}
                />
                Seleccionar capítulos
              </label>
            </div>

            {exportRange === 'custom' && (
              <>
                <div className="chapter-list-actions">
                  <button 
                    className="text-btn" 
                    onClick={() => setSelectedChapters(spine.map(s => s.id))}
                    disabled={isExporting}
                  >
                    Seleccionar todos
                  </button>
                  <span className="divider">|</span>
                  <button 
                    className="text-btn" 
                    onClick={() => setSelectedChapters([])}
                    disabled={isExporting}
                  >
                    Desmarcar todos
                  </button>
                </div>
                <div className="chapter-list">
                  {spine.map((item, idx) => (
                  <div 
                    key={item.id} 
                    className="chapter-item"
                    onClick={() => !isExporting && toggleChapter(item.id)}
                  >
                    <div className={`checkbox-custom ${selectedChapters.includes(item.id) ? 'checked' : ''}`}>
                      {selectedChapters.includes(item.id) && <Check size={12} />}
                    </div>
                    <span>{item.title || `Capítulo ${idx + 1}`}</span>
                  </div>
                ))}
              </div>
              </>
            )}
          </section>

          <section className="settings-section">
            <h3>Configuración de Voz (Piper TTS)</h3>
            <div className="form-group">
              <label>Voz / Modelo</label>
              <select 
                value={selectedVoice} 
                onChange={e => setSelectedVoice(e.target.value)}
                disabled={isExporting}
              >
                {voices.length === 0 ? (
                  <option value="">No se encontraron modelos (.onnx)</option>
                ) : (
                  voices.map(v => <option key={v} value={v}>{v}</option>)
                )}
              </select>
            </div>

            <div className="form-group">
              <div className="label-row">
                <label>Velocidad</label>
                <span className="slider-value">{speed.toFixed(1)}x</span>
              </div>
              <div className="slider-container">
                <Sliders size={16} />
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1" 
                  value={speed} 
                  onChange={e => setSpeed(parseFloat(e.target.value))}
                  disabled={isExporting}
                />
              </div>
            </div>

            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={naturalPauses} 
                onChange={e => setNaturalPauses(e.target.checked)} 
                disabled={isExporting}
              />
              Pausas naturales entre oraciones
            </label>
          </section>

          <section className="settings-section">
            <h3>Opciones Adicionales</h3>
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={exportLyrics} 
                onChange={e => setExportLyrics(e.target.checked)} 
                disabled={isExporting}
              />
              Exportar texto como letras/sincronización (.txt)
            </label>
          </section>

          {isExporting && (
            <div className="progress-container">
              <div className="progress-bar-wrapper">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="progress-status">{status}</div>
            </div>
          )}
        </div>

        <footer className="export-modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isExporting}>
            Cancelar
          </button>
          <button 
            className="btn-export" 
            onClick={handleStartExport} 
            disabled={isExporting || (exportRange === 'custom' && selectedChapters.length === 0) || voices.length === 0}
          >
            {isExporting ? <Clock size={18} className="spin" /> : <Download size={18} />}
            {isExporting ? 'Exportando...' : 'Iniciar Exportación'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default AudiobookExportModal;
