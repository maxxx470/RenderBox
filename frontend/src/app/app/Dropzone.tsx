'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Upload } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';

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
        dragOver ? 'border-[#C81120] bg-[#FBEDEE]' : 'border-[#ECE3E5] bg-[#F8F5F6]'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#E8121F] to-[#7F0000]">
        <Upload set="bold" size={24} primaryColor="#ffffff" />
      </div>
      <h3 className="font-[family-name:var(--font-poppins)] text-[15px] font-semibold text-[#170608]">
        {t('app.dropzoneTitle')}
      </h3>
      <p className="max-w-[280px] text-center text-[13px] text-[#7A6E71]">
        {t('app.dropzoneHint')}
      </p>
      <button
        type="button"
        disabled={uploading}
        className="rounded-[10px] bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-5 py-2.5 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {uploading ? t('app.uploading') : t('app.dropzoneButton')}
      </button>
    </div>
  );
}
