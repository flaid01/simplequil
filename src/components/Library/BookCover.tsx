import React, { useState, useEffect, memo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Book as BookIcon } from 'lucide-react';
import './BookCover.css';

interface BookCoverProps {
  src: string;
  alt: string;
  path: string;
  className?: string;
}

const BookCover: React.FC<BookCoverProps> = ({ src, alt, path, className = '' }) => {
  const [coverSrc, setCoverSrc] = useState<string>(src);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCoverSrc(src);
    setHasError(false);
  }, [src]);

  const handleImageError = async () => {
    try {
      const resource = await invoke('get_book_cover_data', { path }) as { data: string, mime: string };
      if (resource?.data) {
        setCoverSrc(`data:${resource.mime};base64,${resource.data}`);
      } else {
        throw new Error('No data');
      }
    } catch {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <div className={`book-cover-placeholder ${className}`}>
        <BookIcon size={48} strokeWidth={1} />
      </div>
    );
  }

  return (
    <img
      src={coverSrc}
      alt={alt}
      className={`book-cover-img ${className}`}
      onError={handleImageError}
      loading="lazy"
    />
  );
};

// Use React.memo to prevent re-renders unless props change
export default memo(BookCover);
