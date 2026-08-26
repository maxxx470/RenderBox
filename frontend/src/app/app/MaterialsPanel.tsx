'use client';

import { useState } from 'react';
import { Lock } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';

export interface MaterialRow {
  id: string;
  face: string;
  valeur: string;
  source: 'auto' | 'manuel';
  confidence: number | null;
}

function faceLabel(face: string): string {
  return face.replace(/_/g, ' ').toUpperCase();
}

function MaterialCard({
  material,
  onSave,
}: {
  material: MaterialRow;
  onSave: (id: string, valeur: string) => Promise<void>;
}) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(material.valeur);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (editing) {
    return (
      <div className="mb-2.5 rounded-xl border border-[#C81120] bg-white p-3.5">
        <div className="mb-1 flex items-center justify-between font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
          <span>{faceLabel(material.face)}</span>
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mb-2 w-full rounded-lg border border-[#C81120] px-2.5 py-2 text-[13px] outline-none"
        />
        {error && <p className="mb-2 text-xs text-[#C81120]">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving || !draft.trim()}
            onClick={async () => {
              setSaving(true);
              setError(null);
              try {
                await onSave(material.id, draft.trim());
                setEditing(false);
              } catch {
                setError(t('app.materialsSaveError'));
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
          >
            {t('app.materialsSaveButton')}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(material.valeur);
              setEditing(false);
              setError(null);
            }}
            className="rounded-lg bg-[#F1EBEC] px-3 py-1.5 text-[11px] font-semibold text-[#7A6E71]"
          >
            {t('app.materialsCancelButton')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2.5 rounded-xl border border-[#ECE3E5] bg-[#F8F5F6] p-3.5">
      <div className="mb-1 flex items-center justify-between font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
        <span>{faceLabel(material.face)}</span>
        {material.source === 'auto' && material.confidence !== null && (
          <span className="text-[9px]">
            {t('app.materialsConfidence', { n: material.confidence })}
          </span>
        )}
      </div>
      <div className="mb-1.5 text-[13.5px] font-semibold text-[#170608]">{material.valeur}</div>
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer text-[11px] font-medium text-[#C81120]"
      >
        {t('app.materialsEditButton')}
      </span>
    </div>
  );
}

export function MaterialsPanel({
  materials,
  onSave,
}: {
  materials: MaterialRow[];
  onSave: (id: string, valeur: string) => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <aside className="w-[300px] overflow-y-auto border-l border-[#ECE3E5] px-4 py-4.5">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-poppins)] text-[11px] uppercase tracking-wide text-[#7A6E71]">
          {t('app.materialsTitle')}
        </h3>
        {materials.length > 0 && (
          <span className="rounded-[10px] bg-[#1E7A3D14] px-2 py-0.5 font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#1E7A3D]">
            {materials.length}/{materials.length}
          </span>
        )}
      </div>

      {materials.length === 0 ? (
        <div className="flex h-[80%] flex-col items-center justify-center gap-2.5 text-center">
          <Lock set="bold" size={22} primaryColor="#7A6E71" style={{ opacity: 0.5 }} />
          <p className="max-w-[180px] text-xs leading-relaxed text-[#7A6E71]">
            {t('app.materialsEmptyBody')}
          </p>
          <span className="rounded-md bg-[#F1EBEC] px-2 py-0.5 font-[family-name:var(--font-ibm-plex-mono)] text-[9px] text-[#7A6E71]">
            {t('app.materialsBadge')}
          </span>
        </div>
      ) : (
        <>
          <p className="mb-4 text-[11px] leading-relaxed text-[#7A6E71]">
            {t('app.materialsSubtitle')}
          </p>
          {materials.map((m) => (
            <MaterialCard key={m.id} material={m} onSave={onSave} />
          ))}
          <div className="mt-4 rounded-[10px] bg-[#F8F5F6] p-3 text-[11px] leading-relaxed text-[#7A6E71]">
            {t('app.materialsTip')}
          </div>
        </>
      )}
    </aside>
  );
}
