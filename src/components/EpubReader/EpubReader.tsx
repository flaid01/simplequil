import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import {
  ArrowLeft,
  Menu,
  Settings,
  FileText,
  Volume2,
  Maximize,
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Highlighter,
  MessageSquare,
  Quote,
  Focus,
  AlertTriangle,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Trash2,
  Play
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { invoke } from '@tauri-apps/api/core';
import Database from "@tauri-apps/plugin-sql";
import { Book, ThemeType } from '../../types';
import './EpubReader.css';

interface EpubReaderProps {
  book: Book;
  onClose: () => void;
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  onProgressUpdate: (id: string, progress: number) => void;
}

interface EpubResource {
  data: string;
  mime: string;
}

interface SpineItem {
  id: string;
  path: string;
  title?: string;
}

interface TocItem {
  label: string;
  href: string;
  children: TocItem[];
}

interface Highlight {
  id: string;
  book_id: string;
  chapter_id: string;
  content: string;
  color: string;
  date_added: number;
  cfi_range?: string;
}

interface TtsDropdownProps {
  visible: boolean;
  voices: SpeechSynthesisVoice[];
  piperVoices: string[];
  selectedVoice: string;
  onVoiceChange: (name: string) => void;
  pitch: number;
  onPitchChange: (v: number) => void;
  rate: number;
  onRateChange: (v: number) => void;
  volume: number;
  onVolumeChange: (v: number) => void;
  pauses: boolean;
  onPausesToggle: (v: boolean) => void;
}

const TtsDropdown = memo(({
  visible, voices, piperVoices, selectedVoice, onVoiceChange, pitch, onPitchChange, rate, onRateChange, volume, onVolumeChange, pauses, onPausesToggle
}: TtsDropdownProps) => {
  if (!visible) return null;

  return (
    <div className="tts-dropdown" onClick={(e) => e.stopPropagation()}>
      <div className="tts-dropdown-header">
        <Volume2 size={16} />
        <span>Configuración de Voz</span>
      </div>
      
      <div className="tts-dropdown-section">
        <label>Voz</label>
        <select value={selectedVoice} onChange={(e) => onVoiceChange(e.target.value)}>
          {piperVoices.length > 0 && (
            <optgroup label="Piper Voices (Offline)">
              {piperVoices.map(v => (
                <option key={v} value={v}>{v.replace('.onnx', '')}</option>
              ))}
            </optgroup>
          )}
          <optgroup label="System Voices">
            {voices.map(v => (
              <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="tts-dropdown-section">
        <div className="label-row">
          <label>Velocidad</label>
          <span>{rate.toFixed(1)}x</span>
        </div>
        <input type="range" min="0.5" max="3" step="0.1" value={rate} onChange={(e) => onRateChange(parseFloat(e.target.value))} />
      </div>

      <div className="tts-dropdown-section">
        <div className="label-row">
          <label>Tono</label>
          <span>{pitch.toFixed(1)}</span>
        </div>
        <input type="range" min="0.5" max="2" step="0.1" value={pitch} onChange={(e) => onPitchChange(parseFloat(e.target.value))} />
      </div>

      <div className="tts-dropdown-section">
        <div className="label-row">
          <label>Volumen</label>
          <span>{Math.round(volume * 100)}%</span>
        </div>
        <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => onVolumeChange(parseFloat(e.target.value))} />
      </div>

      <div className="tts-dropdown-section">
        <label className="checkbox-label">
          <input type="checkbox" checked={pauses} onChange={(e) => onPausesToggle(e.target.checked)} />
          <span>Pausas naturales</span>
        </label>
      </div>
    </div>
  );
});

interface ReadingSurfaceProps {
  html: string;
  fontSize: number;
  lineHeight: number;
  pageIndex: number;
  viewportWidth: number;
  viewportGap: number;
  animationsEnabled: boolean;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  isSingleColumn?: boolean;
  activeTtsIndex: number | null;
}

const ReadingSurface = memo(({
  html, fontSize, lineHeight, pageIndex, viewportWidth, viewportGap, animationsEnabled, surfaceRef, isSingleColumn, activeTtsIndex      
}: ReadingSurfaceProps) => {
  if (!html || html.trim() === '') return null;
  
  useEffect(() => {
    if (!surfaceRef.current) return;
    const sentences = surfaceRef.current.querySelectorAll('.tts-sentence');
    sentences.forEach(s => s.classList.remove('active'));
    
    if (activeTtsIndex !== null) {
      const activeEl = surfaceRef.current.querySelector(`.tts-sentence[data-index="${activeTtsIndex}"]`);
      if (activeEl) {
        activeEl.classList.add('active');
      }
    }
  }, [activeTtsIndex, surfaceRef, html, pageIndex]);

  return (
    <div
      className={`reader-surface ${isSingleColumn ? 'single-column' : ''}`}
      ref={surfaceRef}
      style={{
        fontSize: `${fontSize}px`,
        lineHeight: lineHeight,
        transform: `translateX(-${pageIndex * (viewportWidth + viewportGap)}px)`,
        transition: animationsEnabled ? 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : 'none',
        opacity: html ? 1 : 0
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

interface SelectionMenuProps {
  visible: boolean;
  x: number;
  y: number;
  onCopy: () => void;
  onAnnotate: () => void;
  onHighlight: (color: string) => void;
  onFocusMode: () => void;
  onTTS: () => void;
}

const SelectionMenu = memo(({ visible, x, y, onCopy, onAnnotate, onHighlight, onFocusMode, onTTS }: SelectionMenuProps) => {
  if (!visible) return null;
  return (
    <div
      className="selection-menu"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, calc(-100% - 10px))'
      }}
    >
      <button className="selection-btn" onClick={onCopy} title="Copiar">
        <Copy size={16} />
      </button>
      <div className="highlight-colors">
        <button className="selection-btn highlight-btn yellow" onClick={() => onHighlight('yellow')} title="Resaltar Amarillo">
          <Highlighter size={16} />
        </button>
        <button className="selection-btn highlight-btn green" onClick={() => onHighlight('green')} title="Resaltar Verde">
          <Highlighter size={16} />
        </button>
        <button className="selection-btn highlight-btn blue" onClick={() => onHighlight('blue')} title="Resaltar Azul">
          <Highlighter size={16} />
        </button>
      </div>
      <button className="selection-btn" onClick={onAnnotate} title="Anotar">
        <MessageSquare size={16} />
      </button>
      <div className="selection-divider" />
      <button className="selection-btn" onClick={onFocusMode} title="Modo Enfoque desde aquí">
        <Focus size={16} />
      </button>
      <button className="selection-btn" onClick={onTTS} title="Escuchar desde aquí">
        <Play size={16} />
      </button>
    </div>
  );
});

// Helper for debouncing function calls
function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timeoutId: ReturnType<typeof setTimeout>;
  const debounced = (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timeoutId);
  return debounced;
}

// Helper to decode Base64 HTML content from Rust
const decodeHtml = (base64: string): string => {
  try {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.error('Error decoding HTML:', e);
    return '';
  }
};

const MarkdownImage: React.FC<{ src?: string; alt?: string; bookPath: string }> = ({ src, alt, bookPath }) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (src?.startsWith('bookimg://')) {
      const internalPath = src.replace('bookimg://', '');
      invoke('get_epub_resource_by_path', { path: bookPath, internalPath })
        .then((resource: any) => {
          if (resource?.data) {
            setDataUrl(`data:${resource.mime};base64,${resource.data}`);
          } else {
            setError(true);
          }
        })
        .catch(() => {
          setError(true);
        });
    }
  }, [src, bookPath]);

  if (src?.startsWith('bookimg://')) {
    if (dataUrl) return <img src={dataUrl} alt={alt} style={{ maxWidth: '100%', borderRadius: '4px', margin: '10px 0', display: 'block' }} />;
    if (error) return <div className="img-error-placeholder" style={{ padding: '10px', background: 'rgba(255,0,0,0.1)', fontSize: '12px', borderRadius: '4px' }}>Error al cargar imagen del libro</div>;
    return <div className="img-loading-placeholder" style={{ padding: '10px', background: 'rgba(128,128,128,0.1)', fontSize: '12px', borderRadius: '4px' }}>Cargando imagen...</div>;
  }
  return <img src={src} alt={alt} style={{ maxWidth: '100%' }} />;
};

const TocNavItem: React.FC<{ item: TocItem, depth: number, onSelect: (href: string) => void, currentChapterPath?: string }> = ({ item, depth, onSelect, currentChapterPath }) => {
  const isSelected = useMemo(() => {
    if (!currentChapterPath) return false;
    const [path] = item.href.split('#');
    return currentChapterPath === path || currentChapterPath.endsWith(path) || path.endsWith(currentChapterPath);
  }, [item.href, currentChapterPath]);

  return (
    <>
      <li 
        className={`toc-item depth-${depth} ${isSelected ? 'active' : ''}`} 
        onClick={() => onSelect(item.href)}
      >
        {item.label}
      </li>
      {item.children.map((child, i) => (
        <TocNavItem key={i} item={child} depth={depth + 1} onSelect={onSelect} currentChapterPath={currentChapterPath} />
      ))}
    </>
  );
};

const EpubReader: React.FC<EpubReaderProps> = ({ book, onClose, theme, setTheme, onProgressUpdate }) => {
  // 1. Refs
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dbRef = useRef<Database | null>(null);
  const isPlayingRef = useRef(false);
  const hasTtsStartedRef = useRef(false);
  const viewportMetricsRef = useRef({ width: 0, gap: 28 });
  const pageIndexRef = useRef(0);
  const ttsQueueRef = useRef<string[]>([]);
  const ttsVoiceRef = useRef<string>('');
  const ttsPreloadingRef = useRef<boolean>(false);
  const audioRef = useRef<HTMLAudioElement>(new Audio());
  const ttsRateRef = useRef<number>(1.0);
  const ttsVolumeRef = useRef<number>(1.0);
  const isResizingRef = useRef(false);
  const paginationTimeoutRef = useRef<number | null>(null);
  const hasInitializedRef = useRef<string | null>(null);
  const isTransitioningRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ttsSessionIdRef = useRef<number>(0);
  const lastPlayedChapterRef = useRef<string | null>(null);

  // 2. States
  const [activeSidebar, setActiveSidebar] = useState<'contents' | 'settings' | 'notes' | 'quotes' | 'none'>('none');
  const [spine, setSpine]                       = useState<SpineItem[]>([]);
  const [toc, setToc]                           = useState<TocItem[]>([]);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [currentChapterHtml, setCurrentChapterHtml] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [viewportMetrics, setViewportMetrics] = useState({ width: 0, gap: 28 });
  const [loading, setLoading]                   = useState(true);
  const [isChapterTransitioning, setIsChapterTransitioning] = useState(false);
  const [error, setError]                       = useState<string | null>(null);
  const [progress, setProgress]                 = useState(0);
  const [fontSize, setFontSize] = useState<number>(parseInt(localStorage.getItem('reader_font_size') || '18') || 18);
  const [lineHeight, setLineHeight] = useState<number>(parseFloat(localStorage.getItem('reader_line_height') || '1.85') || 1.85);
  const animationsEnabled = false;
  const isFullscreen = false;
  const [isFocusMode, setIsFocusMode]     = useState(false);
  const [wpm, setWpm]                     = useState<number>(parseInt(localStorage.getItem('reader_focus_wpm') || '250') || 250);
  const [rsvpIndex, setRsvpIndex]         = useState(0);
  const [isRsvpPlaying, setIsRsvpPlaying] = useState(false);
  const [tokens, setTokens]               = useState<(string | { type: 'image', src: string })[]>([]);  
  const [isPlaying, setIsPlaying]         = useState(false);
  const [activeTtsIndex, setActiveTtsIndex] = useState<number | null>(null);
  const [showTtsDropdown, setShowTtsDropdown] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notesContent, setNotesContent] = useState<string>(localStorage.getItem(`notes_${book.id}`) || '');
  const [notesSidebarWidth, setNotesSidebarWidth] = useState<number>(parseInt(localStorage.getItem('notes_sidebar_width') || '400') || 400);
  const [isPreviewMode, setIsPreviewMode] = useState<boolean>(false);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [piperVoices, setPiperVoices] = useState<string[]>([]);
  const [ttsVoice, setTtsVoice] = useState<string>(localStorage.getItem('tts_voice') || '');
  const [ttsPitch, setTtsPitch] = useState<number>(parseFloat(localStorage.getItem('tts_pitch') || '1.0') || 1.0);
  const [ttsRate, setTtsRate] = useState<number>(parseFloat(localStorage.getItem('tts_rate') || '1.0') || 1.0);
  const [ttsVolume, setTtsVolume] = useState<number>(parseFloat(localStorage.getItem('tts_volume') || '1.0') || 1.0);
  const [ttsPauses, setTtsPauses] = useState<boolean>(localStorage.getItem('tts_pauses') !== 'false');
  const [ttsQueueIndex, setTtsQueueIndex] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [expandedImage, setExpandedImage] = useState<{ src: string; width: number; height: number; mime: string; size: string; internalPath?: string; } | null>(null);
  const [imgZoom, setImgZoom] = useState(1);
  const [imgRotation, setImgRotation] = useState(0);
  const [imgPosition, setImgPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectionMenu, setSelectionMenu] = useState<{ visible: boolean; x: number; y: number; text: string; ttsIndex?: number; tokenIndex?: number; }>({ visible: false, x: 0, y: 0, text: '' });

  // 3. Helper Functions
  const playTick = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, ctx.currentTime);
      gainNode.gain.setValueAtTime(0.04, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.04);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.04);
    } catch (e) { console.warn("Audio feedback error:", e); }
  }, []);

  const tokenizeHtml = useCallback((html: string) => {
    if (!html) return [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const result: (string | { type: 'image', src: string })[] = [];
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          const words = text.split(/\s+/).filter(w => w.length > 0);
          result.push(...words);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.tagName === 'IMG' || el.tagName === 'IMAGE') {
             const src = el.getAttribute('src') || el.getAttribute('href') || el.getAttribute('xlink:href');
             if (src) result.push({ type: 'image', src });
          } else if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
            Array.from(node.childNodes).forEach(walk);
          }
        }
      };
      if (doc.body) walk(doc.body);
      return result;
    } catch (e) { console.error("Tokenization error:", e); return []; }
  }, []);

  const splitIntoSentences = useCallback((text: string): string[] => {
    return text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 1);
  }, []);

  const wrapSentencesInHtml = useCallback((html: string): string => {
    if (!html) return '';
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      let sentenceCount = 0;
      
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          if (text.trim().length === 0) return;
          
          const sentences = splitIntoSentences(text);
          const fragment = document.createDocumentFragment();
          
          let lastIndex = 0;
          sentences.forEach((sentence) => {
            const index = text.indexOf(sentence, lastIndex);
            if (index !== -1) {
              if (index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
              }
              const span = document.createElement('span');
              span.className = 'tts-sentence';
              span.dataset.index = sentenceCount.toString();
              span.textContent = sentence;
              fragment.appendChild(span);
              sentenceCount++;
              lastIndex = index + sentence.length;
            }
          });
          if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
          }
          node.parentNode?.replaceChild(fragment, node);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE' && el.tagName !== 'IMG' && el.tagName !== 'IMAGE') {
            Array.from(node.childNodes).forEach(walk);
          }
        }
      };
      if (doc.body) { walk(doc.body); return doc.body.innerHTML; }
      return html;
    } catch (e) { console.error("Wrap sentences error:", e); return html; }
  }, [splitIntoSentences]);

  const ttsProcessedHtml = useMemo(() => {
    try {
      if (!currentChapterHtml) return '';
      const chapterId = spine[currentChapterIndex]?.id;
      if (!chapterId) return currentChapterHtml;
      const chapterHighlights = highlights.filter(h => h.chapter_id === chapterId);
      
      const parser = new DOMParser();
      const doc = parser.parseFromString(currentChapterHtml, 'text/html');
      if (!doc.body) return currentChapterHtml;

      if (chapterHighlights.length > 0) {
        const textNodes: { node: Text; start: number; end: number }[] = [];
        let globalOffset = 0;
        
        const walk = (node: Node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent || '';
            textNodes.push({ node: node as Text, start: globalOffset, end: globalOffset + text.length });
            globalOffset += text.length;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as HTMLElement;
            if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
              Array.from(node.childNodes).forEach(walk);
            }
          }
        };
        walk(doc.body);

        const fullText = textNodes.map(tn => tn.node.textContent || '').join('');

        const findNormalizedMatch = (haystack: string, needle: string) => {
          const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
          const normNeedle = normalize(needle);
          if (!normNeedle) return null;

          const regexStr = normNeedle
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') 
            .replace(/\s+/g, '\\s+');
          
          try {
            const regex = new RegExp(regexStr, 'g');
            const match = regex.exec(haystack);
            if (match) return { start: match.index, end: match.index + match[0].length };
          } catch (e) { console.warn("[Highlights] Regex match failed:", e); }
          
          return null;
        };

        chapterHighlights.forEach((h) => {
          const match = findNormalizedMatch(fullText, h.content);
          if (!match) return;

          const affectedNodes = textNodes.filter(tn => tn.start < match.end && tn.end > match.start);
          
          affectedNodes.forEach(tn => {
            const parent = tn.node.parentNode;
            if (!parent) return;

            const nodeText = tn.node.textContent || '';
            const relativeStart = Math.max(0, match.start - tn.start);
            const relativeEnd = Math.min(nodeText.length, match.end - tn.start);

            if (relativeStart < relativeEnd) {
              const before = nodeText.substring(0, relativeStart);
              const mid = nodeText.substring(relativeStart, relativeEnd);
              const after = nodeText.substring(relativeEnd);

              const fragment = document.createDocumentFragment();
              if (before) fragment.appendChild(document.createTextNode(before));
              const span = document.createElement('span');
              span.className = `user-highlight ${h.color}`;
              span.textContent = mid;
              fragment.appendChild(span);
              if (after) fragment.appendChild(document.createTextNode(after));
              
              try {
                if (tn.node.parentNode === parent) {
                  parent.replaceChild(fragment, tn.node);
                }
              } catch (e) { console.warn("[Highlights] Replace failed:", e); }
            }
          });
          
          textNodes.length = 0;
          globalOffset = 0;
          walk(doc.body);
        });
      }

      return wrapSentencesInHtml(doc.body.innerHTML);
    } catch (err) {
      console.error("[Highlights] Critical error:", err);
      return currentChapterHtml;
    }
  }, [currentChapterHtml, wrapSentencesInHtml, highlights, currentChapterIndex, spine]);

  const resolvePath = useCallback((basePath: string, relativePath: string) => {
    const baseDir = basePath.split('/').slice(0, -1);
    const parts = relativePath.split('/');
    for (const part of parts) {
      if (part === '..') baseDir.pop();
      else if (part !== '.') baseDir.push(part);
    }
    return baseDir.join('/');
  }, []);

  const processHtml = useCallback(async (html: string, currentPath: string) => {
    if (!html) return '';
    try {
      const parser = new DOMParser();
      let doc = parser.parseFromString(html, 'text/html');
      if (!doc.body || (doc.body.children.length === 0 && html.includes('<?xml'))) {
        const xhtmlDoc = parser.parseFromString(html, 'application/xhtml+xml');
        if (!xhtmlDoc.querySelector('parsererror')) doc = xhtmlDoc;
      }
      if (!doc.body) return html;
      const imgElements = Array.from(doc.querySelectorAll('img'));
      const svgImageElements = Array.from(doc.querySelectorAll('image'));
      const processElement = async (el: Element, attr: string) => {
        const src = el.getAttribute(attr);
        if (src && !src.startsWith('data:') && !src.startsWith('http')) {
          try {
            const decodedSrc = decodeURIComponent(src);
            const cleanSrc = decodedSrc.startsWith('/') ? decodedSrc.substring(1) : decodedSrc;
            const resolvedPath = resolvePath(currentPath, cleanSrc);
            const resource = await invoke('get_epub_resource_by_path', { path: book.path, internalPath: resolvedPath }) as EpubResource;
            if (resource && resource.data) {
              el.setAttribute(attr, `data:${resource.mime};base64,${resource.data}`);
              el.setAttribute('data-internal-path', resolvedPath);
              if (el instanceof HTMLElement || el instanceof SVGElement) {
                el.style.setProperty('max-height', 'var(--column-height, 95%)', 'important');
                el.style.setProperty('object-fit', 'contain', 'important');
                el.style.setProperty('display', 'block', 'important');
                el.style.setProperty('margin', '0 auto', 'important');
              }
            }
          } catch (err) { console.warn(`[Reader] Failed to load resource (${src}):`, err); }
        }
      };
      const tasks: Promise<void>[] = [];
      imgElements.forEach(img => tasks.push(processElement(img, 'src')));
      svgImageElements.forEach(svgImg => tasks.push(processElement(svgImg, svgImg.hasAttribute('xlink:href') ? 'xlink:href' : 'href')));
      if (tasks.length > 0) await Promise.all(tasks);
      return doc.body.innerHTML;
    } catch (e) { console.error("Process HTML error:", e); return html; }
  }, [book.path, resolvePath]);

  const updatePagination = useCallback(() => {
    if (!surfaceRef.current) return;
    if (isTransitioningRef.current) return;
    const surface = surfaceRef.current;
    void surface.offsetHeight;
    const rect = surface.getBoundingClientRect();
    const fullWidth = surface.scrollWidth;
    const pageWidth = rect.width;
    const pageHeight = rect.height;
    if (pageHeight > 0) surface.style.setProperty('--column-height', `${pageHeight}px`);
    const rootStyle = getComputedStyle(document.documentElement);
    const baseGap = parseFloat(rootStyle.getPropertyValue('--col-gap')) || 28;
    const colGap = baseGap * 1.5;
    if (pageWidth > 0) {
      const pages = Math.ceil((fullWidth - 10 + colGap) / (pageWidth + colGap));
      setTotalPages(prev => prev !== pages ? Math.max(1, pages) : prev);
      setViewportMetrics(prev => (prev.width !== pageWidth || prev.gap !== colGap) ? { width: pageWidth, gap: colGap } : prev);
    }
  }, []);

  const debouncedUpdatePagination = useMemo(() => debounce(() => updatePagination(), 150), [updatePagination]);

  const loadChapter = useCallback(async (resourceId: string, fromEnd = false) => {
    setIsChapterTransitioning(true);
    isTransitioningRef.current = true;
    setError(null);
    try {
      const resource = await invoke('get_epub_resource', { path: book.path, resourceId }) as EpubResource;
      if (!resource || !resource.data) throw new Error('Resource data is missing');
      const rawHtml = decodeHtml(resource.data);
      const item = spine.find(s => s.id === resourceId);
      const html = item ? await processHtml(rawHtml, item.path) : rawHtml;
      setCurrentChapterHtml(html || ' ');
      const index = spine.findIndex(s => s.id === resourceId);
      if (index !== -1) {
        setCurrentChapterIndex(index);
        const newProgress = Math.round(((index + 1) / spine.length) * 100);
        setProgress(newProgress);
        onProgressUpdate(book.id, newProgress);
      }
      if (paginationTimeoutRef.current) clearTimeout(paginationTimeoutRef.current);
      paginationTimeoutRef.current = window.setTimeout(() => {
        setIsChapterTransitioning(false);
        isTransitioningRef.current = false;
        if (surfaceRef.current) {
          const pageWidth = surfaceRef.current.clientWidth;
          const fullWidth = surfaceRef.current.scrollWidth;
          const gap = viewportMetricsRef.current.gap || 42;
          setPageIndex(fromEnd && pageWidth > 0 ? Math.max(0, Math.ceil((fullWidth - 10 + gap) / (pageWidth + gap)) - 1) : 0);
          updatePagination();
        }
        setLoading(false);
      }, 100);
    } catch (err) {
      console.error('[Reader] Failed to load chapter:', err);
      setError(`Error al cargar el capítulo: ${err instanceof Error ? err.message : String(err)}`);
      setIsChapterTransitioning(false);
      isTransitioningRef.current = false;
      setLoading(false);
    }
  }, [book.id, book.path, spine, processHtml, updatePagination, onProgressUpdate]);

  const playNextInQueue = useCallback(async (startIndex?: number, sessionId?: number) => {
    const currentSessionId = sessionId !== undefined ? sessionId : ttsSessionIdRef.current;
    
    if (!isPlayingRef.current) {
      return;
    }
    if (sessionId !== undefined && sessionId !== ttsSessionIdRef.current) {
      return;
    }
    
    const index = startIndex !== undefined ? startIndex : ttsQueueIndex;
    const queue = ttsQueueRef.current;
    
    if (index >= queue.length) {
      setActiveTtsIndex(null);
      if (currentChapterIndex < spine.length - 1) { 
        setTtsQueueIndex(0); 
        const nextId = spine[currentChapterIndex + 1].id;
        loadChapter(nextId);
      } else {
        setIsPlaying(false);
        isPlayingRef.current = false;
      }
      return;
    }

    const textChunk = queue[index];
    setActiveTtsIndex(index);
    setTtsQueueIndex(index);
    
    if (surfaceRef.current) {
      const activeEl = surfaceRef.current.querySelector(`.tts-sentence[data-index="${index}"]`);
      if (activeEl) {
        const surfaceRect = surfaceRef.current.getBoundingClientRect();
        const rect = activeEl.getBoundingClientRect();
        const viewport = surfaceRef.current.parentElement?.getBoundingClientRect();
        if (viewport) {
          const width = viewportMetricsRef.current.width;
          const gap = viewportMetricsRef.current.gap;
          if (width > 0) {
            const relativeX = rect.left - surfaceRect.left;
            const sentencePage = Math.floor((relativeX + 5) / (width + gap));
            if (sentencePage !== pageIndexRef.current) {
              setPageIndex(sentencePage);
            }
          }
        }
      }
    }

    let blobUrl: string | null = null;
    try {
      const base64Audio = await invoke('speak_with_piper', { text: textChunk, model: ttsVoiceRef.current }) as string;
      
      if (!isPlayingRef.current || currentSessionId !== ttsSessionIdRef.current) {
        return;
      }

      if (!base64Audio || base64Audio.length < 100) throw new Error("Invalid audio data from backend");

      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/wav' });
      blobUrl = URL.createObjectURL(blob);
      
      const audio = audioRef.current;

      audio.pause();
      if (audio.src && audio.src.startsWith('blob:')) URL.revokeObjectURL(audio.src);
      
      audio.src = blobUrl;
      audio.load();

      return new Promise<void>((resolve) => {
        const cleanup = () => {
          audio.removeEventListener('ended', handleEnded);
          audio.removeEventListener('error', handleError);
          audio.removeEventListener('canplay', handleCanPlay);
          audio.removeEventListener('play', handlePlayStart);
          audio.removeEventListener('playing', handlePlayStart);
        };

        const applySettings = () => {
          audio.playbackRate = ttsRateRef.current;
          audio.volume = ttsVolumeRef.current;
        };

        const handleCanPlay = () => {
          applySettings();
          audio.play().catch(e => {
            if (e.name === 'AbortError') return;
            handleError();
          });
        };

        const handlePlayStart = () => {
          applySettings(); // Re-apply on play start to be sure browser didn't reset it
        };

        const handleEnded = () => {
          cleanup();
          if (isPlayingRef.current && currentSessionId === ttsSessionIdRef.current) {
            setTtsQueueIndex(idx => idx + 1);
            playNextInQueue(index + 1, currentSessionId);
          }
          resolve();
        };

        const handleError = () => {
          cleanup();
          if (isPlayingRef.current && currentSessionId === ttsSessionIdRef.current) {
            setTimeout(() => {
              setTtsQueueIndex(idx => idx + 1);
              playNextInQueue(index + 1, currentSessionId);
            }, 500);
          }
          resolve();
        };

        audio.addEventListener('canplay', handleCanPlay);
        audio.addEventListener('play', handlePlayStart);
        audio.addEventListener('playing', handlePlayStart);
        audio.addEventListener('ended', handleEnded);
        audio.addEventListener('error', handleError);

        if (index + 1 < queue.length && !ttsPreloadingRef.current) {
          ttsPreloadingRef.current = true;
          invoke('speak_with_piper', { text: queue[index + 1], model: ttsVoiceRef.current })
            .finally(() => { 
              ttsPreloadingRef.current = false; 
            });
        }
      });

    } catch (err) { 
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      if (isPlayingRef.current && currentSessionId === ttsSessionIdRef.current) {
        setTimeout(() => {
          setTtsQueueIndex(idx => idx + 1);
          playNextInQueue(index + 1, currentSessionId);
        }, 1000);
      }
    }
  }, [currentChapterIndex, spine, loadChapter, ttsQueueIndex]);

  const init = useCallback(async () => {
    if (hasInitializedRef.current === book.id) return;
    setLoading(true);
    setError(null);
    try {
      const [spineItems, tocItems] = await Promise.all([
        invoke('get_epub_spine', { path: book.path }) as Promise<SpineItem[]>,
        invoke('get_epub_toc', { path: book.path }) as Promise<TocItem[]>
      ]);
      setSpine(spineItems);
      setToc(tocItems);
      if (!spineItems.length) { setError('El libro no tiene contenido'); setLoading(false); return; }
      const progressValue = typeof book.progress === 'number' ? book.progress : 0;
      const savedChapterIndex = Math.min(spineItems.length - 1, Math.max(0, Math.floor((progressValue / 100) * spineItems.length)));
      const resourceId = spineItems[savedChapterIndex].id;
      const resource = await invoke('get_epub_resource', { path: book.path, resourceId }) as EpubResource;
      const rawHtml = decodeHtml(resource.data);
      const html = await processHtml(rawHtml, spineItems[savedChapterIndex].path);
      setCurrentChapterHtml(html || ' ');
      setCurrentChapterIndex(savedChapterIndex);
      setProgress(progressValue || Math.round(((savedChapterIndex + 1) / spineItems.length) * 100));
      hasInitializedRef.current = book.id;
      setLoading(false);
      if (paginationTimeoutRef.current) clearTimeout(paginationTimeoutRef.current);
      paginationTimeoutRef.current = window.setTimeout(updatePagination, 300);
    } catch (err) {
      console.error('[Reader] Init failed:', err);
      setError(`Error al abrir el libro: ${err instanceof Error ? err.message : String(err)}`);
      setLoading(false);
    }
  }, [book.id, book.path, book.progress, processHtml, updatePagination]);

  const handleNext = useCallback(() => {
    if (pageIndex < totalPages - 1) setPageIndex(i => i + 1);
    else if (currentChapterIndex < spine.length - 1) loadChapter(spine[currentChapterIndex + 1].id);
  }, [pageIndex, totalPages, currentChapterIndex, spine, loadChapter]);

  const handlePrev = useCallback(() => {
    if (pageIndex > 0) setPageIndex(i => i - 1);
    else if (currentChapterIndex > 0) loadChapter(spine[currentChapterIndex - 1].id, true);
  }, [pageIndex, currentChapterIndex, spine, loadChapter]);

  const scrollToAnchor = useCallback((anchor: string) => {
    if (!surfaceRef.current || !anchor) return;
    try {
      const escapedAnchor = CSS.escape(anchor);
      const target = surfaceRef.current.querySelector(`[id="${escapedAnchor}"], [name="${escapedAnchor}"], #${escapedAnchor}`);
      if (target) {
        const surfaceRect = surfaceRef.current.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        const width = viewportMetricsRef.current.width;
        const gap = viewportMetricsRef.current.gap;
        if (width > 0) {
          const relativeX = rect.left - surfaceRect.left;
          setPageIndex(Math.floor((relativeX + 5) / (width + gap)));
        }
      }
    } catch (err) { console.error("[Reader] Error scrolling to anchor:", err); }
  }, []);

  const handleInternalLink = useCallback((href: string) => {
    if (!href) return;
    try {
      const decodedHref = decodeURIComponent(href);
      const [path, anchor] = decodedHref.split('#');
      const currentItem = spine[currentChapterIndex];
      if (!path || (currentItem && (path === currentItem.path || path === currentItem.id || currentItem.path.endsWith(path)))) {
        if (anchor) scrollToAnchor(anchor);
        return;
      }
      const targetIndex = spine.findIndex(item => item.id === path || item.path === path || item.path.endsWith(path) || path.endsWith(item.path) || item.path.split('/').pop() === path.split('/').pop());
      if (targetIndex !== -1) {
        loadChapter(spine[targetIndex].id).then(() => { if (anchor) setTimeout(() => scrollToAnchor(anchor), 200); });
      }
    } catch (err) { console.error("[Reader] Error handling internal link:", err); }
  }, [spine, currentChapterIndex, loadChapter, scrollToAnchor]);

  // 4. Initialization and Lifecycle
  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    const initDb = async () => {
      try {
        const db = await Database.load("sqlite:library.db"); dbRef.current = db;
        await db.execute(`CREATE TABLE IF NOT EXISTS highlights (id TEXT PRIMARY KEY, book_id TEXT, chapter_id TEXT, content TEXT, color TEXT, date_added INTEGER, cfi_range TEXT)`);
        const rows = await db.select<Highlight[]>("SELECT * FROM highlights WHERE book_id = ? ORDER BY date_added DESC", [book.id]);
        setHighlights(rows);
      } catch (err) { console.error("Failed to load highlights:", err); }
    };
    initDb();
  }, [book.id]);

  useEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices(); setAvailableVoices(voices);
      if (!ttsVoice && voices.length > 0) {
        const esVoice = voices.find(v => v.lang.startsWith('es'));
        const defaultVoice = esVoice ? esVoice.name : voices[0].name;
        setTtsVoice(defaultVoice); localStorage.setItem('tts_voice', defaultVoice);
      }
    };
    updateVoices(); window.speechSynthesis.onvoiceschanged = updateVoices;
    invoke('get_piper_voices').then((v: any) => setPiperVoices(v)).catch(console.error);
  }, [ttsVoice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F11') { e.preventDefault(); if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
      else if (e.key === 'ArrowRight') { 
        if (isFocusMode) setRsvpIndex(prev => Math.min(tokens.length - 1, prev + 1)); 
        else if (activeSidebar !== 'notes' || e.altKey) handleNext(); 
      }
      else if (e.key === 'ArrowLeft') { 
        if (isFocusMode) setRsvpIndex(prev => Math.max(0, prev - 1)); 
        else if (activeSidebar !== 'notes' || e.altKey) handlePrev(); 
      }
      else if (e.key === 'PageDown') { e.preventDefault(); handleNext(); }
      else if (e.key === 'PageUp') { e.preventDefault(); handlePrev(); }
      else if (e.key === ' ' && isFocusMode) { e.preventDefault(); setIsRsvpPlaying(prev => !prev); }
      else if (e.key === 'Escape' && isFocusMode) { setIsRsvpPlaying(false); setIsFocusMode(false); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setActiveSidebar(prev => prev === 'notes' ? 'none' : 'notes'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleNext, handlePrev, activeSidebar, isFocusMode, tokens.length]);

  useEffect(() => {
    const handleMouseUpDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      if (link && e.button === 0) {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http')) { e.preventDefault(); e.stopPropagation(); handleInternalLink(href); return; }
      }
      if (isFocusMode) return;
      if (e.button === 0 && (target.tagName.toLowerCase() === 'img' || target.tagName.toLowerCase() === 'image')) {
        const src = target.getAttribute('src') || target.getAttribute('href') || target.getAttribute('xlink:href') || '';
        if (src) {
          const img = new Image();
          img.onload = () => {
            let mime = 'image/unknown', size = 'Unknown';
            if (src.startsWith('data:')) {
              const parts = src.split(',');
              const mimeMatch = parts[0].match(/:(.*?);/); if (mimeMatch) mime = mimeMatch[1];
              const bytes = Math.floor((parts[1].length * 3) / 4);
              size = bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${(bytes / 1024).toFixed(2)} KB`;
            }
            setExpandedImage({ src, width: img.naturalWidth, height: img.naturalHeight, mime, size, internalPath: target.getAttribute('data-internal-path') || undefined });
            setImgZoom(1); setImgRotation(0); setImgPosition({ x: 0, y: 0 });
          };
          img.src = src; setSelectionMenu(prev => ({ ...prev, visible: false })); return;
        }
      }
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const text = selection.toString().trim();
        if (text.length > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          
          let ttsIndex = -1;
          const startNode = range.startContainer;
          if (startNode) {
            let targetNode = startNode;
            if (startNode.nodeType !== Node.TEXT_NODE) {
              targetNode = startNode.childNodes[range.startOffset] || startNode;
            }
            const parent = targetNode.nodeType === Node.TEXT_NODE ? targetNode.parentElement : targetNode as HTMLElement;
            const ttsSentence = parent?.closest('.tts-sentence');
            if (ttsSentence) {
              ttsIndex = parseInt(ttsSentence.getAttribute('data-index') || '-1');
              console.log("[Selection] Found tts-sentence index:", ttsIndex);
            } else {
              // Fallback: look for the first tts-sentence inside the target if we selected a block
              const firstChildSentence = (targetNode as HTMLElement).querySelector?.('.tts-sentence');
              if (firstChildSentence) {
                ttsIndex = parseInt(firstChildSentence.getAttribute('data-index') || '-1');
                console.log("[Selection] Found fallback tts-sentence index:", ttsIndex);
              } else {
                console.log("[Selection] No tts-sentence found near selection.");
              }
            }
          }

          setSelectionMenu({ 
            visible: true, 
            x: rect.left + rect.width / 2, 
            y: rect.top, 
            text,
            ttsIndex: ttsIndex >= 0 ? ttsIndex : undefined
          });
        }
      }
    };
    const handleMouseDownDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.selection-menu')) setSelectionMenu(prev => ({ ...prev, visible: false }));
      if (!(e.target as HTMLElement).closest('.tts-dropdown') && !(e.target as HTMLElement).closest('.playback-control')) setShowTtsDropdown(false);
    };
    document.addEventListener('mouseup', handleMouseUpDoc);
    document.addEventListener('mousedown', handleMouseDownDoc);
    return () => { document.removeEventListener('mouseup', handleMouseUpDoc); document.removeEventListener('mousedown', handleMouseDownDoc); };
  }, [handleInternalLink, isFocusMode]);

  useEffect(() => {
    if (isFocusMode && currentChapterHtml) {
      const newTokens = tokenizeHtml(currentChapterHtml);
      setTokens(newTokens);
      // Only reset to 0 if we aren't already at a specific index (like one from a selection)
      if (rsvpIndex === 0) {
        setRsvpIndex(0);
      }
    }
  }, [isFocusMode, currentChapterHtml, tokenizeHtml]);

  useEffect(() => {
    let interval: number | null = null;
    if (isRsvpPlaying && tokens.length > 0) {
      const msPerWord = (60 / wpm) * 1000;
      interval = window.setInterval(() => {
        setRsvpIndex(prev => {
          if (prev >= tokens.length - 1) {
            if (currentChapterIndex < spine.length - 1) {
              loadChapter(spine[currentChapterIndex + 1].id);
              return prev;
            } else {
              setIsRsvpPlaying(false);
              return prev;
            }
          }
          playTick();
          return prev + 1;
        });
      }, msPerWord);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isRsvpPlaying, tokens.length, wpm, playTick, currentChapterIndex, spine, loadChapter]);

  const handleReadAloud = useCallback((forcedStartIndex?: number) => {
    if (isPlaying) { 
      setIsPlaying(false); 
      isPlayingRef.current = false; 
      ttsSessionIdRef.current++; 
      window.getSelection()?.removeAllRanges();
      window.speechSynthesis.cancel(); 
      if (audioRef.current) { 
        audioRef.current.pause(); 
        if (audioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
        audioRef.current.src = ''; 
      } 
    } else {
      const surface = surfaceRef.current; if (!surface) return;
      const sentenceNodes = Array.from(surface.querySelectorAll('.tts-sentence'));
      const sentences = sentenceNodes.map(n => (n.textContent || '').trim()).filter(s => s.length > 0);
      if (sentences.length === 0) {
        return;
      }

      if (ttsVoice.endsWith('.onnx')) {
        ttsQueueRef.current = sentences; 
        setIsPlaying(true); 
        isPlayingRef.current = true;
        ttsSessionIdRef.current++; 
        
        let startIndex = forcedStartIndex !== undefined ? forcedStartIndex : ttsQueueIndex;
        
        // Only calculate based on visibility if we're starting fresh (no forced index and no previous start)
        if (forcedStartIndex === undefined && !hasTtsStartedRef.current) {
          const firstVisible = sentenceNodes.find(node => {
            const rect = node.getBoundingClientRect();
            const viewport = surface.parentElement?.getBoundingClientRect();
            return viewport && rect.left >= viewport.left - 10 && rect.left < viewport.right;
          });
          if (firstVisible) {
            startIndex = parseInt((firstVisible as HTMLElement).dataset.index || '0');
          }
        }
        
        if (forcedStartIndex !== undefined) {
          hasTtsStartedRef.current = true;
          // Important: mark this chapter as "in progress" so the useEffect doesn't reset it to 0
          lastPlayedChapterRef.current = spine[currentChapterIndex]?.id;
        }
        
        playNextInQueue(startIndex, ttsSessionIdRef.current);
      } else {
        window.speechSynthesis.cancel(); 
        hasTtsStartedRef.current = true;
        const utterance = new SpeechSynthesisUtterance(surface.textContent || '');
        if (ttsVoice) { 
          const voice = window.speechSynthesis.getVoices().find(v => v.name === ttsVoice); 
          if (voice) utterance.voice = voice; 
        }
        utterance.rate = ttsRateRef.current;
        utterance.volume = ttsVolumeRef.current;
        utterance.onend = () => { if (isPlayingRef.current) handleNext(); else setIsPlaying(false); };
        window.speechSynthesis.speak(utterance);
        setIsPlaying(true); isPlayingRef.current = true;
        ttsSessionIdRef.current++;
      }
    }
  }, [isPlaying, ttsVoice, ttsQueueIndex, playNextInQueue, handleNext, currentChapterIndex, spine]);

  useEffect(() => {
    const chapterId = spine[currentChapterIndex]?.id;
    if (isPlaying && ttsProcessedHtml && !isChapterTransitioning && lastPlayedChapterRef.current !== chapterId) {
      const doc = new DOMParser().parseFromString(ttsProcessedHtml, 'text/html');
      const sentences = Array.from(doc.querySelectorAll('.tts-sentence'))
        .map(n => (n.textContent || '').trim())
        .filter(s => s.length > 0);
      
      if (sentences.length > 0) { 
        console.log("[TTS] Chapter transition or auto-start for chapter:", chapterId);
        lastPlayedChapterRef.current = chapterId;
        ttsQueueRef.current = sentences; 
        ttsSessionIdRef.current++; 
        // Only jump to 0 if we're not using a forced starting point (handled in handleReadAloud)
        playNextInQueue(0, ttsSessionIdRef.current); 
      }
    }
  }, [ttsProcessedHtml, isChapterTransitioning, isPlaying, playNextInQueue, currentChapterIndex, spine]);

  useEffect(() => {
    if (!surfaceRef.current || !currentChapterHtml) return;
    const resizeObserver = new ResizeObserver(() => debouncedUpdatePagination());
    resizeObserver.observe(surfaceRef.current.parentElement || surfaceRef.current);
    updatePagination();
    return () => { resizeObserver.disconnect(); debouncedUpdatePagination.cancel(); };
  }, [currentChapterHtml, fontSize, lineHeight, activeSidebar, updatePagination, debouncedUpdatePagination]);

  useEffect(() => { localStorage.setItem(`notes_${book.id}`, notesContent); }, [notesContent, book.id]);
  useEffect(() => { localStorage.setItem('notes_sidebar_width', notesSidebarWidth.toString()); }, [notesSidebarWidth]);
  useEffect(() => { localStorage.setItem('reader_font_size', fontSize.toString()); }, [fontSize]);
  useEffect(() => { localStorage.setItem('reader_line_height', lineHeight.toString()); }, [lineHeight]);
  useEffect(() => { localStorage.setItem('reader_focus_wpm', wpm.toString()); }, [wpm]);
  useEffect(() => {
    localStorage.setItem('tts_voice', ttsVoice);
    localStorage.setItem('tts_pitch', ttsPitch.toString());
    localStorage.setItem('tts_rate', ttsRate.toString());
    localStorage.setItem('tts_volume', ttsVolume.toString());
    localStorage.setItem('tts_pauses', ttsPauses.toString());
  }, [ttsVoice, ttsPitch, ttsRate, ttsVolume, ttsPauses]);

  useEffect(() => { pageIndexRef.current = pageIndex; }, [pageIndex]);
  useEffect(() => { viewportMetricsRef.current = viewportMetrics; }, [viewportMetrics]);
  useEffect(() => { ttsVoiceRef.current = ttsVoice; }, [ttsVoice]);
  useEffect(() => { ttsRateRef.current = ttsRate; }, [ttsRate]);
  useEffect(() => { ttsVolumeRef.current = ttsVolume; }, [ttsVolume]);

  const handleStartTTSAtSelection = useCallback(() => {
    console.log("[Playback] Starting TTS at index:", selectionMenu.ttsIndex);
    if (selectionMenu.ttsIndex !== undefined) {
      setTtsQueueIndex(selectionMenu.ttsIndex);
      if (!isPlaying) handleReadAloud(selectionMenu.ttsIndex);
      else playNextInQueue(selectionMenu.ttsIndex, ttsSessionIdRef.current);
      
      setSelectionMenu(prev => ({ ...prev, visible: false }));
      window.getSelection()?.removeAllRanges();
    }
  }, [selectionMenu, isPlaying, handleReadAloud, playNextInQueue]);

  const handleStartFocusAtSelection = useCallback(() => {
    console.log("[Playback] Starting Focus at index:", selectionMenu.ttsIndex);
    const chapterHtml = currentChapterHtml;
    if (!chapterHtml) return;

    const newTokens = tokenizeHtml(chapterHtml);
    setTokens(newTokens);
    
    let index = 0;
    if (selectionMenu.ttsIndex !== undefined) {
      const surface = surfaceRef.current;
      if (surface) {
        const previousSentences = Array.from(surface.querySelectorAll('.tts-sentence'))
          .slice(0, selectionMenu.ttsIndex);
        const wordCount = previousSentences.reduce((acc, s) => {
          return acc + (s.textContent || '').split(/\s+/).filter(w => w.length > 0).length;
        }, 0);
        index = wordCount;
        console.log("[Playback] Focus word index calculated:", index);
      }
    }
    
    setRsvpIndex(index);
    setIsFocusMode(true);
    setIsRsvpPlaying(false);
    
    setSelectionMenu(prev => ({ ...prev, visible: false }));
    window.getSelection()?.removeAllRanges();
  }, [selectionMenu, currentChapterHtml, tokenizeHtml]);

  const handleSaveHighlight = useCallback(async (color: string) => {
    if (!selectionMenu.text || !dbRef.current) return;
    const highlight: Highlight = {
      id: crypto.randomUUID(),
      book_id: book.id,
      chapter_id: spine[currentChapterIndex].id,
      content: selectionMenu.text,
      color,
      date_added: Date.now()
    };
    try {
      await dbRef.current.execute(
        "INSERT INTO highlights (id, book_id, chapter_id, content, color, date_added) VALUES (?, ?, ?, ?, ?, ?)",
        [highlight.id, highlight.book_id, highlight.chapter_id, highlight.content, highlight.color, highlight.date_added]
      );
      setHighlights(prev => [highlight, ...prev]);
      setSelectionMenu(prev => ({ ...prev, visible: false }));
      window.getSelection()?.removeAllRanges();
    } catch (err) { console.error("Failed to save highlight:", err); }
  }, [selectionMenu.text, book.id, currentChapterIndex, spine]);

  const handleImageCopy = useCallback(async () => {
    if (!expandedImage) return;
    try {
      const response = await fetch(expandedImage.src);
      const blob = await response.blob();
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      setCopyFeedback("¡Imagen copiada!");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (err) { console.error("Failed to copy image:", err); }
  }, [expandedImage]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging && expandedImage) {
        setImgPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, expandedImage]);

  const handleMouseMoveResize = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const isNotes = activeSidebar === 'notes';
    const isQuotes = activeSidebar === 'quotes';
    if (isNotes) {
      const newWidth = Math.max(250, Math.min(800, window.innerWidth - e.clientX));
      setNotesSidebarWidth(newWidth);
    } else if (isQuotes) {
      const newWidth = Math.max(250, Math.min(800, e.clientX));
      setNotesSidebarWidth(newWidth); 
    }
  }, [activeSidebar]);

  const handleMouseUpResize = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleMouseMoveResize);
    document.removeEventListener('mouseup', handleMouseUpResize);
    document.body.style.cursor = 'default';
  }, [handleMouseMoveResize]);

  const handleAddImageToNotes = useCallback(() => {
    if (!expandedImage || !expandedImage.internalPath) return;
    const imgMarkdown = `\n\n![${expandedImage.internalPath}](bookimg://${expandedImage.internalPath})\n\n`;
    setNotesContent(prev => prev + imgMarkdown);
    setExpandedImage(null);
    setActiveSidebar('notes');
  }, [expandedImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          if (base64) {
            const imgMarkdown = `\n![Pasted Image](${base64})\n`;
            setNotesContent(prev => prev + imgMarkdown);
          }
        };
        reader.readAsDataURL(blob);
        e.preventDefault();
      }
    }
  }, []);

  if (error) {
    return (
      <div className="reader-error-container">
        <AlertTriangle size={48} />
        <h1>Error al cargar el libro</h1>
        <p>{error}</p>
        <button className="reader-btn" onClick={onClose}>Volver a la Biblioteca</button>
      </div>
    );
  }

  return (
    <div className={`epub-reader-container theme-${theme} ${isFullscreen ? 'is-fullscreen' : ''} ${isFocusMode ? 'focus-mode' : ''} ${activeSidebar === 'notes' ? 'notes-open' : ''}`}>
      <header className="reader-top-bar">
        <div className="reader-toolbar-group">
          <button className="reader-btn" onClick={onClose}><ArrowLeft size={20} /><span>Biblioteca</span></button>
          <div className="divider" style={{ width: 1, height: 24, backgroundColor: 'var(--reader-border)', margin: '0 8px' }} />
          <button className={`reader-btn ${activeSidebar === 'contents' ? 'active' : ''}`} onClick={() => setActiveSidebar(activeSidebar === 'contents' ? 'none' : 'contents')}><Menu size={20} /><span>Contenidos</span></button>
          <button className={`reader-btn ${activeSidebar === 'notes' ? 'active' : ''}`} onClick={() => setActiveSidebar(activeSidebar === 'notes' ? 'none' : 'notes')}><FileText size={20} /><span>Notas</span></button>
          <button className={`reader-btn ${activeSidebar === 'quotes' ? 'active' : ''}`} onClick={() => setActiveSidebar(activeSidebar === 'quotes' ? 'none' : 'quotes')}><Quote size={20} /><span>Citas</span></button>
        </div>
        <div className="reader-toolbar-group">
          <button className={`reader-btn ${isFocusMode ? 'active' : ''}`} onClick={() => setIsFocusMode(!isFocusMode)}><Focus size={20} /></button>
          
          <div style={{ position: 'relative' }}>
            <div className="reader-toolbar-group playback-control-group">
              <button className={`reader-btn ${isPlaying ? 'active' : ''}`} onClick={() => handleReadAloud()}><Volume2 size={20} /></button>
              <button className={`reader-btn playback-settings-btn ${showTtsDropdown ? 'active' : ''}`} onClick={() => setShowTtsDropdown(!showTtsDropdown)} title="Configuración de Voz"><Settings size={16} /></button>
            </div>
            <TtsDropdown 
              visible={showTtsDropdown} 
              voices={availableVoices} 
              piperVoices={piperVoices} 
              selectedVoice={ttsVoice} 
              onVoiceChange={setTtsVoice} 
              pitch={ttsPitch} 
              onPitchChange={setTtsPitch} 
              rate={ttsRate} 
              onRateChange={setTtsRate} 
              volume={ttsVolume} 
              onVolumeChange={setTtsVolume} 
              pauses={ttsPauses} 
              onPausesToggle={setTtsPauses} 
            />
          </div>

          <button className="reader-btn" onClick={() => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }}><Maximize size={20} /></button>
          <button className={`reader-btn ${activeSidebar === 'settings' ? 'active' : ''}`} onClick={() => setActiveSidebar(activeSidebar === 'settings' ? 'none' : 'settings')}><Settings size={20} /></button>
        </div>
      </header>

      <main className="reader-main-area">
        <aside className={`reader-sidebar ${activeSidebar === 'contents' ? 'open' : ''}`}>
          <div className="sidebar-header"><h2>Contenidos</h2><button className="reader-btn" onClick={() => setActiveSidebar('none')}><X size={20} /></button></div>
          <div className="sidebar-content">
            <div className="toc-container">
              {toc.length > 0 ? (
                <ul className="toc-list">
                  {toc.map((item, i) => (
                    <TocNavItem key={i} item={item} depth={0} onSelect={handleInternalLink} currentChapterPath={spine[currentChapterIndex]?.path} />
                  ))}
                </ul>
              ) : (
                <ul className="toc-list">
                  {spine.map((item, index) => (
                    <li key={item.id} className={`toc-item ${currentChapterIndex === index ? 'active' : ''}`} onClick={() => loadChapter(item.id)}>
                      {item.title || `Capítulo ${index + 1}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>

        <aside className={`reader-sidebar quotes-sidebar ${activeSidebar === 'quotes' ? 'open' : ''}`} style={{ width: activeSidebar === 'quotes' ? `${notesSidebarWidth}px` : 0 }}>
          <div className="sidebar-resize-handle left" onMouseDown={(e) => { e.preventDefault(); isResizingRef.current = true; document.addEventListener('mousemove', handleMouseMoveResize); document.addEventListener('mouseup', handleMouseUpResize); document.body.style.cursor = 'col-resize'; }} />
          <div className="sidebar-header"><h2>Citas y Resaltados</h2><button className="reader-btn" onClick={() => setActiveSidebar('none')}><X size={20} /></button></div>
          <div className="sidebar-content quotes-list">
            {highlights.length === 0 ? <div className="empty-quotes">No has guardado ninguna cita aún.</div> : highlights.map(h => (
              <div key={h.id} className={`quote-card ${h.color}`}>
                <div className="quote-content">"{h.content}"</div>
                <div className="quote-footer">
                  <button className="quote-action jump-btn" onClick={() => loadChapter(h.chapter_id)}><Play size={14} /></button>
                  <button className="quote-action delete-btn" onClick={() => { if (dbRef.current) { dbRef.current.execute("DELETE FROM highlights WHERE id = ?", [h.id]); setHighlights(prev => prev.filter(x => x.id !== h.id)); } }}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <aside className={`reader-sidebar right notes-sidebar ${activeSidebar === 'notes' ? 'open' : ''}`} style={{ width: activeSidebar === 'notes' ? `${notesSidebarWidth}px` : 0 }}>
          <div className="sidebar-resize-handle" onMouseDown={(e) => { e.preventDefault(); isResizingRef.current = true; document.addEventListener('mousemove', handleMouseMoveResize); document.addEventListener('mouseup', handleMouseUpResize); document.body.style.cursor = 'col-resize'; }} />
          <div className="sidebar-header">
            <h2 className="notes-title">Notas</h2>
            <div className="header-actions">
              <button className={`reader-btn slim-btn ${!isPreviewMode ? 'active' : ''}`} onClick={() => setIsPreviewMode(false)}>Edit</button>
              <button className={`reader-btn slim-btn ${isPreviewMode ? 'active' : ''}`} onClick={() => setIsPreviewMode(true)}>Preview</button>
              <div className="divider-v" />
              <button className="reader-btn slim-btn" onClick={() => { navigator.clipboard.writeText(notesContent); setCopyFeedback("¡Notas copiadas!"); setTimeout(() => setCopyFeedback(null), 2000); }} title="Copiar Markdown"><Copy size={14} /></button>
              <button className="reader-btn" onClick={() => setActiveSidebar('none')}><X size={20} /></button>
            </div>
          </div>
          <div className="sidebar-content notes-editor-container" style={{ padding: 0 }}>
            {isPreviewMode ? (
              <div className="notes-preview markdown-body" style={{ padding: '16px' }}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]} 
                  urlTransform={(url) => url.startsWith('bookimg://') ? url : url}
                  components={{ 
                    img: (props: any) => <MarkdownImage src={props.src} alt={props.alt} bookPath={book.path} />,
                    a: (props: any) => <a href={props.href} target="_blank" rel="noopener noreferrer">{props.children}</a>
                  }}
                >
                  {notesContent || '*No hay notas aún.*'}
                </ReactMarkdown>
              </div>
            ) : (
              <textarea 
                className="notes-editor" 
                value={notesContent} 
                onChange={(e) => setNotesContent(e.target.value)} 
                onPaste={handlePaste}
                placeholder="Escribe tus notas aquí (Markdown soportado)..." 
              />
            )}
          </div>
        </aside>

        <aside className={`reader-sidebar right settings-sidebar ${activeSidebar === 'settings' ? 'open' : ''}`}>
          <div className="sidebar-header"><h2>Ajustes</h2><button className="reader-btn" onClick={() => setActiveSidebar('none')}><X size={20} /></button></div>
          <div className="sidebar-content">
            <div className="settings-group"><label>Tema</label><div className="theme-selector"><div className={`theme-option theme-light-opt ${theme === 'light' ? 'active' : ''}`} onClick={() => setTheme('light')} /><div className={`theme-option theme-sepia-opt ${theme === 'sepia' ? 'active' : ''}`} onClick={() => setTheme('sepia')} /><div className={`theme-option theme-dark-opt ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')} /></div></div>
            <div className="settings-group"><label>Tamaño de Fuente</label><div className="font-size-control"><button className="font-size-btn" onClick={() => setFontSize(Math.max(12, fontSize - 1))}>A-</button><span className="font-size-label">{fontSize}px</span><button className="font-size-btn" onClick={() => setFontSize(Math.min(32, fontSize + 1))}>A+</button></div></div>
            <div className="settings-group"><label>Interlineado</label><div className="font-size-control"><button className="font-size-btn" onClick={() => setLineHeight(Math.max(1.2, lineHeight - 0.1))}>-</button><span className="font-size-label">{lineHeight.toFixed(1)}</span><button className="font-size-btn" onClick={() => setLineHeight(Math.min(2.5, lineHeight + 0.1))}>+</button></div></div>
            <div className="settings-group"><label>Velocidad de Enfoque (PPM)</label><div className="font-size-control"><button className="font-size-btn" onClick={() => setWpm(Math.max(50, wpm - 50))}>-</button><span className="font-size-label">{wpm}</span><button className="font-size-btn" onClick={() => setWpm(Math.min(1000, wpm + 50))}>+</button></div></div>
          </div>
        </aside>

        <div className="reader-content-viewport">
          <SelectionMenu 
            visible={selectionMenu.visible} 
            x={selectionMenu.x} 
            y={selectionMenu.y} 
            onCopy={() => { 
              navigator.clipboard.writeText(selectionMenu.text); 
              setSelectionMenu(prev => ({ ...prev, visible: false })); 
              setCopyFeedback("¡Texto copiado!");
              setTimeout(() => setCopyFeedback(null), 2000);
              window.getSelection()?.removeAllRanges(); 
            }} 
            onAnnotate={() => { 
              if (selectionMenu.text) { 
                setNotesContent(prev => prev + (prev ? '\n\n' : '') + `> ${selectionMenu.text}\n\n`); 
                setActiveSidebar('notes'); 
              } 
              setSelectionMenu(prev => ({ ...prev, visible: false })); 
              window.getSelection()?.removeAllRanges(); 
            }} 
            onHighlight={handleSaveHighlight} 
            onFocusMode={handleStartFocusAtSelection}
            onTTS={handleStartTTSAtSelection}
          />
          {copyFeedback && <div className="copy-feedback-toast">{copyFeedback}</div>}
          {isFocusMode && (
            <div className="rsvp-overlay">
              <div className="rsvp-content">
                {typeof tokens[rsvpIndex] === 'string' ? (
                  <div className="rsvp-word">{tokens[rsvpIndex]}</div>
                ) : (
                  (tokens[rsvpIndex] as any)?.src && <img src={(tokens[rsvpIndex] as any).src} alt="Book" className="rsvp-image" />
                )}
              </div>
              <div className="rsvp-stats">
                {tokens.length > 0 ? Math.round((rsvpIndex / tokens.length) * 100) : 0}% del capítulo · {wpm} PPM
              </div>
              <div className="rsvp-hint">Espacio para pausar · Flechas para navegar · Esc para salir</div>
            </div>
          )}
          <ReadingSurface html={ttsProcessedHtml} fontSize={fontSize} lineHeight={lineHeight} pageIndex={pageIndex} viewportWidth={viewportMetrics.width} viewportGap={viewportMetrics.gap} animationsEnabled={animationsEnabled && !isChapterTransitioning} surfaceRef={surfaceRef} isSingleColumn={activeSidebar === 'notes' || activeSidebar === 'quotes'} activeTtsIndex={activeTtsIndex} />
          {loading && <div className="loading-state">Cargando...</div>}
        </div>
      </main>

      {expandedImage && (
        <div className="image-overlay" onClick={() => setExpandedImage(null)}>
          <div className="expanded-image-controls" onClick={e => e.stopPropagation()}>
            <button className="ctrl-btn" onClick={() => setImgZoom(z => Math.min(5, z + 0.2))} title="Zoom In"><ZoomIn size={20} /></button>
            <button className="ctrl-btn" onClick={() => setImgZoom(z => Math.max(0.5, z - 0.2))} title="Zoom Out"><ZoomOut size={20} /></button>
            <button className="ctrl-btn" onClick={() => setImgRotation(r => (r + 90) % 360)} title="Rotate"><RotateCw size={20} /></button>
            <div className="ctrl-divider" />
            {expandedImage.internalPath && <button className="ctrl-btn" onClick={handleAddImageToNotes} title="Add to Notes"><FileText size={20} /></button>}
            <button className="ctrl-btn" onClick={handleImageCopy} title="Copy Image"><Copy size={20} /></button>
            <button className="ctrl-btn close" onClick={() => setExpandedImage(null)} title="Close"><X size={20} /></button>
          </div>
          <div className="expanded-image-info">
            <div className="info-item"><span>{expandedImage.width} × {expandedImage.height}</span><span className="dot-separator">·</span><span>{expandedImage.size}</span></div>
            {expandedImage.internalPath && <div className="info-item" style={{opacity: 0.6, fontSize: '11px', marginTop: 4}}>{expandedImage.internalPath}</div>}
          </div>
          {copyFeedback && <div className="copy-feedback-toast">{copyFeedback}</div>}
          <div className="image-scroll-container" onMouseDown={e => { setDragStart({ x: e.clientX - imgPosition.x, y: e.clientY - imgPosition.y }); setIsDragging(true); }}>
            <img src={expandedImage.src} alt="Expanded book" style={{ transform: `translate(${imgPosition.x}px, ${imgPosition.y}px) scale(${imgZoom}) rotate(${imgRotation}deg)`, cursor: isDragging ? 'grabbing' : 'grab' }} draggable={false} />
          </div>
        </div>
      )}

      <footer className="reader-bottom-bar slim">
        <div className="bottom-bar-main">
          <div className="slider-container global-container">
            <button className="nav-arrow" onClick={handlePrev} title="Página Anterior"><ChevronLeft size={20} /></button>
            <input 
              type="range" 
              min="0" 
              max={spine.length - 1} 
              value={currentChapterIndex} 
              onChange={(e) => loadChapter(spine[parseInt(e.target.value)].id)} 
              className="reader-progress-slider book-global" 
              style={{ '--p': `${progress}%` } as React.CSSProperties}
            />
            <button className="nav-arrow" onClick={handleNext} title="Siguiente Página"><ChevronRight size={20} /></button>
          </div>
        </div>
        <div className="bottom-bar-info">
          <div className="info-left"><span className="current-chapter-title">{spine[currentChapterIndex]?.title || `Capítulo ${currentChapterIndex + 1}`}</span></div>
          <div className="info-right"><span className="progress-details">Pág. {pageIndex + 1} / {totalPages} <span className="dot-separator">·</span> {progress}%</span></div>
        </div>
      </footer>
    </div>
  );
};

export default EpubReader;
