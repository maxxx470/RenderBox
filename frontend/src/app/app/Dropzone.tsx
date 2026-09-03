'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';

// Single source of truth for what the client offers to upload — mirrored by the
// canvas drop target in AppShell. The server still re-validates by magic bytes
// (lib/server/upload/sniff.ts); this is UX, not a security boundary.
export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function Dropzone({
  uploading,
  onFile,
}: {
  uploading: boolean;
  onFile: (file: File) => void;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-1 cursor-pointer flex-col items-center justify-center gap-3.5 rounded-2xl border-2 border-dashed ${
        dragOver ? 'border-[#716FFF] bg-[#EFECFF]' : 'border-[#ECECF2] bg-[#F7F7FA]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
        <Upload set="light" size={24} primaryColor="#ffffff" />
      </div>
      <h3 className="font-[family-name:var(--font-general-sans)] text-[15px] font-semibold text-[#17161F]">
        {t('app.dropzoneTitle')}
      </h3>
      <p className="max-w-[280px] text-center text-[13px] text-[#8A8896]">
        {t('app.dropzoneHint')}
      </p>
      <button
        type="button"
        disabled={uploading}
        className="rounded-[10px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {uploading ? t('app.uploading') : t('app.dropzoneButton')}
      </button>
    </div>
  );
}
