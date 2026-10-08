'use client';

// "Contexte" — what the engine already knows about this project before it
// reads a single word of the prompt.
//
// In this product that context is the materials sheet: the facade, the roof,
// the joinery and the ground that were detected on the first render and are
// re-injected into every generation afterwards, which is what keeps ten
// renders of the same building looking like the same building.
//
// It was a bare count on a static pill — "Contexte 4" — which named a number
// and hid the only thing worth knowing, which four. The panel lists them, so
// the chip answers its own question. It also carries the reference bar's own
// Context control into this bar, which is what it is here for.
//
// Read-only on purpose: editing a material has a whole panel of its own, with
// the confidence, the source and the save/undo states this popover has no room
// for. Sending someone there is honest; a second, poorer editor is not.
import { Document } from 'react-iconly';
import { CHIP_STATIC } from './chip';
import type { MaterialRow } from './MaterialsPanel';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { POPOVER_HEADING, popoverPanelClass, useHoverPopover } from './useHoverPopover';

/** Iconly's Document (Curved), grey like the other chip glyphs. */
function ContextGlyph() {
  return <Document set="curved" size={15} primaryColor="#8A8896" />;
}

export function ContextChip({ materials }: { materials: MaterialRow[] }) {
  const t = useTranslations();
  const { open, ref, toggle, hoverProps } = useHoverPopover();

  return (
    <div className="relative" ref={ref} {...hoverProps}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Same shape as the interactive chips but muted: this one reports,
        // it does not change what the next generation does.
        className={`${CHIP_STATIC} transition-colors hover:border-[#DEDEE8]`}
      >
        <ContextGlyph />
        {t('app.contextChipLabel')}
        {materials.length > 0 && (
          <span className="rounded-md bg-[#EEF1FF] px-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[#1E36D6]">
            {materials.length}
          </span>
        )}
      </button>

      {open && (
        <div className={`${popoverPanelClass({ placement: 'up' })} w-[268px]`}>
          <p className={POPOVER_HEADING}>{t('app.contextChipLabel')}</p>
          {materials.length === 0 ? (
            <p className="rounded-[10px] bg-[#FBFBFD] px-2.5 py-3 text-[11.5px] leading-[1.5] text-[#8A8896]">
              {t('app.contextEmpty')}
            </p>
          ) : (
            <>
              <p className="px-2 pb-2 text-[11.5px] leading-[1.5] text-[#8A8896]">
                {t('app.contextHint')}
              </p>
              <dl className="flex max-h-[212px] flex-col gap-px overflow-y-auto">
                {materials.map((m) => (
                  <div key={m.id} className="rounded-[10px] px-2.5 py-1.5 hover:bg-[#F7F7FA]">
                    <dt className="font-[family-name:var(--font-mono)] text-[9.5px] uppercase tracking-wide text-[#8A8896]">
                      {m.face.replace(/_/g, ' ')}
                    </dt>
                    <dd className="text-[12.5px] leading-[1.4] text-[#17161F]">{m.valeur}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      )}
    </div>
  );
}
