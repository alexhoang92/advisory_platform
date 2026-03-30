import React, { useRef, useState, useCallback } from 'react';
import { Image, X, Loader } from 'lucide-react';
import { getStoredToken } from '../../lib/api';

interface ImageUploadProps {
  imageUrls: string[];
  onChange: (urls: string[]) => void;
}

async function uploadFile(file: File): Promise<string> {
  const token = getStoredToken();
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/v1/uploads/image', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body?.error?.message ?? 'Upload failed');
  }

  const json = (await res.json()) as { data: { url: string } };
  return json.data.url;
}

function isImageFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);
}

export function ImageUpload({ imageUrls, onChange }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const images = files.filter(isImageFile);
      if (images.length === 0) return;

      setUploading(true);
      setError(null);
      try {
        const urls = await Promise.all(images.map(uploadFile));
        onChange([...imageUrls, ...urls]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [imageUrls, onChange],
  );

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    void handleFiles(files);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    void handleFiles(files);
  }

  function removeImage(url: string) {
    onChange(imageUrls.filter((u) => u !== url));
  }

  return (
    <div>
      <p className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
        Images
      </p>

      {/* Previews */}
      {imageUrls.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 mb-2">
          {imageUrls.map((url) => (
            <div key={url} className="relative group rounded overflow-hidden aspect-video bg-[var(--color-bg-elevated)]">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeImage(url)}
                className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone / button row */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={[
          'flex items-center gap-2 px-3 py-2 rounded border border-dashed transition-colors',
          dragging
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
            : 'border-[var(--color-border)] hover:border-[var(--color-text-tertiary)]',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
        >
          {uploading ? <Loader size={13} className="animate-spin" /> : <Image size={13} />}
          {uploading ? 'Uploading…' : 'Add images'}
        </button>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          or drag &amp; drop · paste into title/body
        </span>
      </div>

      {error && (
        <p className="text-xs text-[var(--color-negative)] mt-1">{error}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}

/** Paste handler — call this from a form's onPaste to capture pasted images */
export function extractPastedImages(e: React.ClipboardEvent): File[] {
  const items = Array.from(e.clipboardData.items);
  return items
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((f): f is File => f !== null);
}
