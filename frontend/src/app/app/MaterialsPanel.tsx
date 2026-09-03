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
      <div className="mb-2.5 rounded-xl border border-[#716FFF] bg-white p-3.5">
        <div className="mb-1 flex items-center justify-between font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
          <span>{faceLabel(material.face)}</span>
        </div>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mb-2 w-full rounded-lg border border-[#716FFF] px-2.5 py-2 text-[13px] outline-none"
        />
        {error && <p className="mb-2 text-xs text-[#E5484D]">{error}</p>}
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
            className="rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-60"
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
            className="rounded-lg bg-[#F1F0F6] px-3 py-1.5 text-[11px] font-semibold text-[#8A8896]"
          >
            {t('app.materialsCancelButton')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-2.5 rounded-xl border border-[#ECECF2] bg-[#F7F7FA] p-3.5">
      <div className="mb-1 flex items-center justify-between font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
        <span>{faceLabel(material.face)}</span>
        {material.source === 'auto' && material.confidence !== null && (
          <span className="text-[9px]">
            {t('app.materialsConfidence', { n: material.confidence })}
          </span>
        )}
      </div>
      <div className="mb-1.5 text-[13.5px] font-semibold text-[#17161F]">{material.valeur}</div>
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer text-[11px] font-medium text-[#716FFF]"
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
    // Same outlined-panel treatment as the left rail — one flush side and one
    // outlined side would read as a layout mistake. bg-white matters on
    // mobile, where this is a fixed drawer over a dimmed backdrop.
    <aside className="w-[300px] overflow-y-auto border-l border-[#ECECF2] bg-white px-4 py-4.5 min-[900px]:m-2.5 min-[900px]:rounded-2xl min-[900px]:border min-[900px]:border-[#DEDEE8]">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-[family-name:var(--font-general-sans)] text-[11px] uppercase tracking-wide text-[#8A8896]">
          {t('app.materialsTitle')}
        </h3>
        {materials.length > 0 && (
          <span className="rounded-[10px] bg-[#1E7A3D14] px-2 py-0.5 font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#1E7A3D]">
            {materials.length}/{materials.length}
          </span>
        )}
      </div>

      {materials.length === 0 ? (
        <div className="flex h-[80%] flex-col items-center justify-center gap-2.5 text-center">
          <Lock set="light" size={22} primaryColor="#8A8896" style={{ opacity: 0.5 }} />
          {/* No "soon" badge here. The sheet is not an unbuilt feature — it is
              built, and simply has nothing to show until a render exists. The
              sentence above states that condition exactly; the badge said the
              opposite. */}
          <p className="max-w-[180px] text-xs leading-relaxed text-[#6B6880]">
            {t('app.materialsEmptyBody')}
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-[11px] leading-relaxed text-[#8A8896]">
            {t('app.materialsSubtitle')}
          </p>
          {materials.map((m) => (
            <MaterialCard key={m.id} material={m} onSave={onSave} />
          ))}
          <div className="mt-4 rounded-[10px] bg-[#F7F7FA] p-3 text-[11px] leading-relaxed text-[#8A8896]">
            {t('app.materialsTip')}
          </div>
        </>
      )}
    </aside>
  );
}
