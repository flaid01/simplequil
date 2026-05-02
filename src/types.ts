export type FileType = 'epub' | 'pdf' | 'mobi' | 'cbz';

export interface Book {
  id: string;
  path: string;
  title: string;
  author: string;
  coverImage: string;
  progress: number; // 0 to 100
  fileType: FileType;
  dateAdded: number; // timestamp
  lastOpened: number; // timestamp
  isFavorite: boolean;
  shelfId?: string; // Changed from category to shelfId
  isDeleted: boolean;
  synopsis?: string;
  language?: string;
  seriesId?: string;
  seriesName?: string;
  volumeNumber?: number;
}

export interface Series {
  id: string;
  name: string;
  coverImage?: string;
  author?: string;
  synopsis?: string;
}

export interface Shelf {
  id: string;
  name: string;
  bookIds: string[]; // Store IDs for easy reference, though we'll likely use book.shelfId for filtering
}

export type ViewMode = 'grid' | 'list';

export type SortOption = 'title' | 'author' | 'date' | 'notes' | 'progress';

export type ThemeType = 'light' | 'sepia' | 'dark';

export interface SpineItem {
  id: string;
  path: string;
  title?: string;
}

export interface PremiumVoice {
  id: string;
  name: string;
  lang: string;
  isDownloaded: boolean;
  isDownloading: boolean;
  progress: number;
}

export const PREMIUM_VOICES: PremiumVoice[] = [
  { id: 'es-es-1', name: 'Laura (Castellano)', lang: 'es-ES', isDownloaded: false, isDownloading: false, progress: 0 },
  { id: 'es-mx-1', name: 'Miguel (Mexicano)', lang: 'es-MX', isDownloaded: false, isDownloading: false, progress: 0 },
];

export interface Highlight {
  id: string;
  bookId: string;
  chapterId: string;
  cfi: string;
  text: string;
  color: string;
  note?: string;
  date: number;
}
