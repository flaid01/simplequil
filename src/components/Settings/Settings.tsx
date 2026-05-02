import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Keyboard, 
  Info, 
  Palette, 
  Bell, 
  Monitor, 
  Volume2,
  Download,
  CheckCircle,
  Loader2,
  BookOpen,
  Trash2
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ThemeType } from '../../types';
import './Settings.css';

interface PiperModel {
  name: string;
  language: string;
  quality: string;
  url: string;
}

interface SettingsProps {
  onClose: () => void;
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  openDirectlyToReader: boolean;
  setOpenDirectlyToReader: (val: boolean) => void;
  launcherOpenDirectly: boolean;
  setLauncherOpenDirectly: (val: boolean) => void;
}

type TabType = 'system' | 'shortcuts' | 'tts';

const Settings: React.FC<SettingsProps> = ({ 
  onClose, theme, setTheme, 
  openDirectlyToReader, setOpenDirectlyToReader,
  launcherOpenDirectly, setLauncherOpenDirectly
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('system');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  
  const [piperVoices, setPiperVoices] = useState<string[]>([]);
  const [availablePiperModels, setAvailablePiperModels] = useState<PiperModel[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState('');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('All');

  const loadPiperVoices = async () => {
    try {
      const downloaded = await invoke('get_piper_voices') as string[];
      setPiperVoices(downloaded);
      const available = await invoke('get_available_piper_models') as PiperModel[];
      setAvailablePiperModels(available);
    } catch (err) {
      console.error('Error loading Piper voices:', err);
    }
  };

  const languages = ['All', ...Array.from(new Set(availablePiperModels.map(m => m.language)))].sort();

  const filteredModels = availablePiperModels.filter(model => {
    if (!model) return false;
    const name = model.name || '';
    const language = model.language || '';
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         language.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLang = selectedLanguage === 'All' || language === selectedLanguage;
    return matchesSearch && matchesLang;
  });

  const [pitch, setPitch] = useState(1);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [naturalPauses, setNaturalPauses] = useState(true);

  useEffect(() => {
    const loadVoices = async () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);
      
      const savedVoice = localStorage.getItem('tts_voice');
      if (savedVoice) {
        setSelectedVoice(savedVoice);
      } else if (availableVoices.length > 0) {
        // Find a default Spanish voice or just the first one
        const esVoice = availableVoices.find(v => v.lang.startsWith('es'));
        const defaultVoice = esVoice ? esVoice.name : availableVoices[0].name;
        setSelectedVoice(defaultVoice);
        localStorage.setItem('tts_voice', defaultVoice);
      }
      
      const savedPitch = localStorage.getItem('tts_pitch');
      if (savedPitch) setPitch(parseFloat(savedPitch));
      
      const savedRate = localStorage.getItem('tts_rate');
      if (savedRate) setRate(parseFloat(savedRate));

      const savedVolume = localStorage.getItem('tts_volume');
      if (savedVolume) setVolume(parseFloat(savedVolume));

      const savedPauses = localStorage.getItem('tts_pauses');
      if (savedPauses !== null) setNaturalPauses(savedPauses === 'true');
    };

    loadVoices();
    loadPiperVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    let unlisten: any;
    const setupListener = async () => {
      unlisten = await listen('download-progress', (event: any) => {
        setDownloadMsg(event.payload as string);
      });
    };
    setupListener();

    return () => { if (unlisten) unlisten(); };
  }, []);

  const handleDownloadModel = async (model: PiperModel) => {
    try {
      setDownloadingModel(model.name);
      setDownloadMsg(`Iniciando descarga de ${model.name}...`);
      await invoke('download_piper_model', { name: model.name, url: model.url });
      await loadPiperVoices();
      setDownloadingModel(null);
      setDownloadMsg('');
    } catch (err) {
      console.error('Download failed:', err);
      setDownloadingModel(null);
      alert('Error al descargar el modelo: ' + err);
    }
  };

  const handleDeleteVoice = async (voiceName: string) => {
    if (!window.confirm(`¿Seguro que quieres eliminar la voz ${voiceName}?`)) return;
    try {
      await invoke('delete_piper_voice', { name: voiceName });
      await loadPiperVoices();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Error al eliminar la voz: ' + err);
    }
  };

  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const voiceName = e.target.value;
    setSelectedVoice(voiceName);
    localStorage.setItem('tts_voice', voiceName);
  };

  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setPitch(val);
    localStorage.setItem('tts_pitch', val.toString());
  };

  const handleRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setRate(val);
    localStorage.setItem('tts_rate', val.toString());
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    localStorage.setItem('tts_volume', val.toString());
  };

  const handlePausesToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setNaturalPauses(val);
    localStorage.setItem('tts_pauses', val.toString());
  };

  const shortcutSections = [
    {
      title: 'Biblioteca',
      items: [
        { key: 'Ctrl + K', description: 'Abrir paleta de comandos' },
        { key: 'Ctrl + B', description: 'Enfocar barra lateral' },
        { key: 'Ctrl + O', description: 'Importar archivo' },
        { key: 'Ctrl + Shift + O', description: 'Importar carpeta' },
        { key: 'Ctrl + F', description: 'Enfocar barra de búsqueda' },
        { key: 'G', description: 'Vista de cuadrícula' },
        { key: 'L', description: 'Vista de lista' },
        { key: 'F', description: 'Añadir a favoritos (seleccionado)' },
        { key: 'Esc', description: 'Cerrar menús o detalles' },
      ]
    },
    {
      title: 'Lector EPUB',
      items: [
        { key: 'Flecha Derecha / Izq', description: 'Siguiente / Anterior página' },
        { key: 'Alt + Flechas', description: 'Navegar mientras escribes notas' },
        { key: 'PageUp / PageDown', description: 'Navegar rápidamente' },
        { key: 'Ctrl + N', description: 'Abrir / cerrar notas' },
        { key: 'Space', description: 'Reproducir / Pausa (Focus Mode)' },
        { key: 'Esc', description: 'Salir de Focus Mode / Lector' },
        { key: 'F11', description: 'Pantalla completa' },
      ]
    }
  ];

  return (
    <div className={`settings-view theme-${theme}`}>
      <div className="settings-header">
        <div className="header-left">
          <div className="header-title">
            <SettingsIcon size={24} />
            <h1>Settings</h1>
          </div>
          
          <div className="settings-tabs">
            <button 
              className={`tab-button ${activeTab === 'system' ? 'active' : ''}`}
              onClick={() => setActiveTab('system')}
            >
              <Monitor size={18} />
              <span>System</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'tts' ? 'active' : ''}`}
              onClick={() => setActiveTab('tts')}
            >
              <Volume2 size={18} />
              <span>Text to Speech</span>
            </button>
            <button 
              className={`tab-button ${activeTab === 'shortcuts' ? 'active' : ''}`}
              onClick={() => setActiveTab('shortcuts')}
            >
              <Keyboard size={18} />
              <span>Shortcuts</span>
            </button>
          </div>
        </div>
        
        <button className="close-button" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'shortcuts' && (
          <section className="settings-section">
            <div className="section-header">
              <Keyboard size={20} />
              <h2>Keyboard Shortcuts</h2>
            </div>
            
            {shortcutSections.map((section, sIndex) => (
              <div key={sIndex} className="shortcut-group">
                <h3 className="shortcut-section-title">{section.title}</h3>
                <div className="shortcuts-grid">
                  {section.items.map((shortcut, index) => (
                    <div key={index} className="shortcut-item">
                      <span className="shortcut-description">{shortcut.description}</span>
                      <span className="shortcut-key">{shortcut.key}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'tts' && (
          <>
            <section className="settings-section">
              <div className="section-header">
                <Volume2 size={20} />
                <h2>Text to Speech</h2>
              </div>
              
              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Voice</span>
                  <span className="setting-description">Select the narration voice</span>
                </div>
                <select 
                  className="setting-select" 
                  value={selectedVoice} 
                  onChange={handleVoiceChange}
                >
                  {piperVoices.length > 0 && (
                    <optgroup label="Piper Voices (Offline)">
                      {piperVoices.map(v => (
                        <option key={v} value={v}>{v.replace('.onnx', '')}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="System Voices">
                    {voices.map((voice) => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Speed</span>
                  <span className="setting-description">Playback rate: {rate.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2" 
                  step="0.1" 
                  value={rate} 
                  onChange={handleRateChange}
                  className="setting-range"
                />
              </div>

              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Pitch</span>
                  <span className="setting-description">Voice pitch level: {pitch.toFixed(1)}</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2" 
                  step="0.1" 
                  value={pitch} 
                  onChange={handlePitchChange}
                  className="setting-range"
                />
              </div>

              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Volume</span>
                  <span className="setting-description">Sound level: {Math.round(volume * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  value={volume} 
                  onChange={handleVolumeChange}
                  className="setting-range"
                />
              </div>

              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Natural Pauses</span>
                  <span className="setting-description">Pause for commas and periods</span>
                </div>
                <input 
                  type="checkbox" 
                  className="setting-checkbox" 
                  checked={naturalPauses} 
                  onChange={handlePausesToggle} 
                />
              </div>
            </section>

            <section className="settings-section">
              <div className="section-header">
                <Download size={20} />
                <h2>Piper (Local TTS)</h2>
              </div>
              <p className="section-intro">Descarga modelos .onnx de alta calidad para exportar audiolibros offline.</p>
              
              <div className="piper-controls">
                <select 
                  className="setting-select" 
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                >
                  {languages.map(lang => (
                    <option key={lang} value={lang}>{lang === 'All' ? 'Todos los idiomas' : lang}</option>
                  ))}
                </select>
                <input 
                  type="text" 
                  placeholder="Buscar voz..." 
                  className="setting-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="piper-models-grid">
                {filteredModels.map((model) => {
                  const isDownloaded = piperVoices.some(v => v === `${model.name}.onnx`);
                  const isDownloading = downloadingModel === model.name;

                  return (
                    <div key={model.name} className="piper-model-card">
                      <div className="model-info">
                        <span className="model-name">{model.name.split('-')[1]?.toUpperCase() || model.name.toUpperCase()}</span>
                        <span className="model-meta">{model.language} · {model.quality}</span>
                      </div>
                      
                      <div className="model-actions">
                        <button 
                          className={`download-btn ${isDownloaded ? 'downloaded' : ''}`}
                          onClick={() => !isDownloaded && !isDownloading && handleDownloadModel(model)}
                          disabled={isDownloading}
                        >
                          {isDownloading ? (
                            <Loader2 size={18} className="spin" />
                          ) : isDownloaded ? (
                            <CheckCircle size={18} />
                          ) : (
                            <Download size={18} />
                          )}
                          <span>{isDownloaded ? 'Instalado' : isDownloading ? 'Bajando...' : 'Obtener'}</span>
                        </button>
                        
                        {isDownloaded && (
                          <button 
                            className="delete-voice-btn"
                            onClick={() => handleDeleteVoice(`${model.name}.onnx`)}
                            title="Eliminar voz"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {downloadMsg && (
                <div className="download-status-bar">
                  <Loader2 size={14} className="spin" />
                  <span>{downloadMsg}</span>
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'system' && (
          <>
            <section className="settings-section">
              <div className="section-header">
                <Palette size={20} />
                <h2>Appearance</h2>
              </div>
              <div className="setting-option theme-selection-container">
                <div className="setting-info">
                  <span className="setting-label">Theme</span>
                  <span className="setting-description">Choose your preferred theme</span>
                </div>
                <div className="theme-selector">
                  <div 
                    className={`theme-option theme-light-opt ${theme === 'light' ? 'active' : ''}`} 
                    onClick={() => setTheme('light')} 
                    title="Light"
                  />
                  <div 
                    className={`theme-option theme-sepia-opt ${theme === 'sepia' ? 'active' : ''}`} 
                    onClick={() => setTheme('sepia')} 
                    title="Sepia"
                  />
                  <div 
                    className={`theme-option theme-dark-opt ${theme === 'dark' ? 'active' : ''}`}  
                    onClick={() => setTheme('dark')}  
                    title="Dark"
                  />
                </div>
              </div>
            </section>

            <section className="settings-section">
              <div className="section-header">
                <BookOpen size={20} />
                <h2>Lectura</h2>
              </div>
              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Abrir directamente en el lector</span>
                  <span className="setting-description">Saltar la vista de detalles al seleccionar un libro en la biblioteca</span>
                </div>
                <input 
                  type="checkbox" 
                  className="setting-checkbox" 
                  checked={openDirectlyToReader}
                  onChange={(e) => setOpenDirectlyToReader(e.target.checked)}
                />
              </div>
              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Launcher: Abrir directamente en el lector</span>
                  <span className="setting-description">Saltar la vista de detalles al seleccionar un libro en el buscador (Ctrl+K)</span>
                </div>
                <input 
                  type="checkbox" 
                  className="setting-checkbox" 
                  checked={launcherOpenDirectly}
                  onChange={(e) => setLauncherOpenDirectly(e.target.checked)}
                />
              </div>
            </section>

            <section className="settings-section">
              <div className="section-header">
                <Bell size={20} />
                <h2>Notifications</h2>
              </div>
              <div className="setting-option">
                <div className="setting-info">
                  <span className="setting-label">Enable Notifications</span>
                  <span className="setting-description">Receive updates and alerts</span>
                </div>
                <input type="checkbox" className="setting-checkbox" defaultChecked />
              </div>
            </section>

            <section className="settings-section">
              <div className="section-header">
                <Info size={20} />
                <h2>About</h2>
              </div>
              <div className="about-info">
                <p><strong>SimpleQuil</strong> - v1.0.0</p>
                <p>Digital Library Manager built with Tauri and React.</p>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default Settings;
