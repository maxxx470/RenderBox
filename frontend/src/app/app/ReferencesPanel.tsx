'use client';

// « Images de référence », at the top of the generator's right column, where
// the materials sheet used to be (2026-10-25, owner).
//
// It shows what the engine will be shown besides the sketch: up to three of
// the account's own images, each a thumbnail with a cross to take it off.
// Two ways in — « Utiliser comme référence » under a finished render, and the
// button here, which takes a picture from the computer.
import { Delete, Plus } from 'react-iconly';
import { useRef } from 'react';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { ACCEPTED_UPLOAD_TYPES } from './upload-types';
import { MAX_REFERENCES, type ReferenceImage } from './references';

export function ReferencesPanel({
  references,
  onAdd,
  onRemove,
  busy,
}: {
  references: ReferenceImage[];
  /** A picture from the computer; the page uploads it and pins the result. */
  onAdd: (file: File) => void;
  onRemove: (nodeId: string) => void;
  /** An upload is in flight: the button waits rather than queueing a second. */
  busy: boolean;
}) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const full = references.length >= MAX_REFERENCES;

  return (
    <section className="min-w-0 px-4 py-4.5" aria-labelledby="references-title">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3
          id="references-title"
          className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[#8A8896]"
        >
          {t('app.referencesTitle')}
        </h3>
        {references.length > 0 && (
          <span className="font-[family-name:var(--font-mono)] text-[11px] text-[#8A8896]">
            {references.length}/{MAX_REFERENCES}
          </span>
        )}
      </div>

      <p className="mb-3 text-[12.5px] leading-[1.55] text-[#6B6878]">
        {references.length === 0 ? t('app.referencesEmpty') : t('app.referencesHint')}
      </p>

      {references.length > 0 && (
        <ul className="mb-3 grid grid-cols-3 gap-2">
          {references.map((reference) => (
            <li key={reference.nodeId} className="relative">
              {/* A plain <img>, like the recent-images list: the proxy
                  checks ownership on every request, so next/image cannot
                  serve it. */}
              <img
                src={`/api/render-nodes/${reference.nodeId}/image?size=thumb`}
                alt=""
                loading="lazy"
                className="h-[58px] w-full rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(reference.nodeId)}
                title={t('app.referenceRemove')}
                aria-label={t('app.referenceRemove')}
                className="absolute -right-1.5 -top-1.5 flex h-[22px] w-[22px] items-center justify-center rounded-md bg-white shadow-[0_4px_10px_-4px_rgba(23,22,31,0.45)] hover:bg-[#E9E9EE]"
              >
                <Delete set="curved" size={13} primaryColor="#3D3B49" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        type="file"
        accept={ACCEPTED_UPLOAD_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared first: picking the same file twice in a row must fire.
          e.target.value = '';
          if (file) onAdd(file);
        }}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={full || busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#F2F2F5] px-3 py-2 text-[12px] font-semibold text-[#3D3B49] transition-colors hover:bg-[#E9E9EE] disabled:opacity-50"
      >
        <Plus set="curved" size={14} primaryColor="#3D3B49" />
        {busy ? t('app.referenceAdding') : t('app.referenceAddFile')}
      </button>
      {full && <p className="mt-2 text-[11.5px] text-[#8A8896]">{t('app.referencesFull')}</p>}
    </section>
  );
}
