'use client';

// The materials sheet of the image shown on the generator (2026-10-19, owner:
// « la fiche de matériaux ne fonctionne pas … quand le rendu est fait, les
// matériaux du rendu ne s'affichent pas »). The top of the right column:
//   - the image's code on the whole site (« RP-7K4M2Q »),
//   - the ambiance it was made with and the code of its source,
//   - which colour of the source became which material in this render,
//   - « Copier »: the whole sheet as text, to paste under the prompt of a new
//     render so it keeps the same materials and the same ambiance.
// The lines come from the render's analysis, which runs after the render is
// delivered: the panel asks again every few seconds while it is "pending".
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import { useLocale, useTranslations } from '@/lib/i18n/LocaleContext';
import { formatSheetBlock } from '@/lib/render-sheet';
import { SHEET_COST } from '@/lib/provider-cost';
import { creditDetailOf, errorCodeOf, plansReasonFor } from './request-error';
import { useAppChrome } from './AppChrome';
import { creditsChanged } from './fresh-credits';
import { PRESETS, isPresetKey } from '@/lib/server/generation/presets';

interface SheetAnswer {
  code: string;
  kind: string;
  preset: string | null;
  sheet: {
    status: 'idle' | 'pending' | 'ready' | 'unavailable' | 'failed';
    lines: { color: string; material: string }[];
    ambiance: { key: string; sky: 'hazy' | 'sun' | null } | null;
    sourceCode: string | null;
    failure?: string;
  } | null;
}

/** The sheet as text, with the lines only once they exist. */
function blockOf(
  answer: SheetAnswer,
  locale: 'fr' | 'en',
  t: ReturnType<typeof useTranslations>,
): string {
  const sheet = answer.sheet;
  const ambianceKey = sheet?.ambiance?.key ?? null;
  const sky = sheet?.ambiance?.sky ?? null;
  return formatSheetBlock(
    {
      code: answer.code,
      sourceCode: sheet?.sourceCode ?? null,
      ambianceKey,
      ambianceLabel:
        ambianceKey && isPresetKey(ambianceKey) ? PRESETS[ambianceKey].label[locale] : null,
      sky,
      skyLabel: sky ? t(sky === 'hazy' ? 'app.skyHazy' : 'app.skySun') : null,
      lines: sheet?.status === 'ready' ? sheet.lines : [],
    },
    locale,
  );
}

const POLL_MS = 4000;
const POLL_MAX = 60;

export function RenderSheetPanel({ nodeId }: { nodeId: string | null }) {
  const t = useTranslations();
  const { locale } = useLocale();
  const { toast } = useToast();
  const [answer, setAnswer] = useState<SheetAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const chrome = useAppChrome();
  // True once THIS user asked for the analysis (copying an unanalysed sheet).
  const asked = useRef(false);

  useEffect(() => {
    setAnswer(null);
    setFailed(false);
    if (!nodeId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const read = () => {
      api<SheetAnswer>(`/api/render-nodes/${nodeId}/sheet`)
        .then((a) => {
          if (!alive) return;
          setAnswer(a);
          const status = a.sheet?.status;
          if (status === 'pending' && ++tries < POLL_MAX) {
            timer = setTimeout(read, POLL_MS);
          } else if (asked.current && (status === 'ready' || status === 'failed')) {
            asked.current = false;
            // Ready, or failed and refunded: the balance is read again.
            creditsChanged();
            if (status === 'ready') {
              toast(t('app.sheetDone'), 'success');
              void navigator.clipboard?.writeText(blockOf(a, locale, t)).catch(() => undefined);
            } else {
              toast(t('app.sheetFailedRefunded'), 'error');
            }
          }
        })
        .catch(() => alive && setFailed(true));
    };
    read();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [nodeId, tick]);

  const sheet = answer?.sheet ?? null;
  const ambianceKey = sheet?.ambiance?.key ?? null;
  const ambianceLabel =
    ambianceKey && isPresetKey(ambianceKey) ? PRESETS[ambianceKey].label[locale] : null;
  const sky = sheet?.ambiance?.sky ?? null;
  const skyLabel = sky ? t(sky === 'hazy' ? 'app.skyHazy' : 'app.skySun') : null;

  const needsAnalysis = sheet !== null && sheet.status !== 'ready' && sheet.status !== 'pending';

  async function copy() {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(blockOf(answer, locale, t));
      toast(t(needsAnalysis ? 'app.sheetCopiedAsking' : 'app.sheetCopied'), 'success');
    } catch {
      toast(t('app.sheetCopyFailed'), 'error');
    }
    // The analysis is asked, and paid, only when the sheet is copied — and
    // only if it does not exist yet.
    if (!needsAnalysis) return;
    try {
      await api(`/api/render-nodes/${nodeId}/sheet/analyze`, {
        method: 'POST',
      });
      asked.current = true;
      setTick((n) => n + 1);
      creditsChanged();
    } catch (err) {
      const reason = plansReasonFor(err);
      if (reason) chrome?.openPlans(reason, creditDetailOf(err));
      else if (errorCodeOf(err) === 'SHEET_NOT_CONFIGURED')
        toast(t('app.sheetUnavailable'), 'error');
      else toast(t('app.sheetAskFailed'), 'error');
    }
  }

  return (
    <section className="min-w-0 px-4 py-4.5" aria-labelledby="render-sheet-title">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3
          id="render-sheet-title"
          className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-[#8A8896]"
        >
          {t('app.materialsTitle')}
        </h3>
        {answer && (
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-lg bg-[#EEF1FF] px-2.5 py-1 text-[11.5px] font-semibold text-[#1E36D6] hover:bg-[#E3E8FF]"
          >
            {t('app.sheetCopy')}
            {needsAnalysis ? ` · ${SHEET_COST} ${t('app.sheetCredits')}` : ''}
          </button>
        )}
      </div>

      {!nodeId ? (
        <p className="text-center text-[12.5px] leading-snug text-[#8A8896]">
          {t('app.materialsEmptyBody')}
        </p>
      ) : failed ? (
        <p className="text-[12.5px] leading-snug text-[#8A8896]">{t('app.sheetFailed')}</p>
      ) : !answer ? (
        <p className="text-[12.5px] leading-snug text-[#8A8896]">{t('app.sheetPending')}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          <dl className="flex flex-col gap-1 text-[11.5px] text-[#3D3B49]">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-[#8A8896]">{t('app.sheetCode')}</dt>
              <dd className="font-[family-name:var(--font-mono)] font-medium text-[#17161F]">
                {answer.code}
              </dd>
            </div>
            {sheet?.sourceCode && (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[#8A8896]">{t('app.sheetSource')}</dt>
                <dd className="font-[family-name:var(--font-mono)]">{sheet.sourceCode}</dd>
              </div>
            )}
            {ambianceLabel && (
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-[#8A8896]">{t('app.sheetAmbiance')}</dt>
                <dd className="text-right">
                  {ambianceLabel}
                  {skyLabel ? ` · ${skyLabel}` : ''}
                </dd>
              </div>
            )}
          </dl>

          {!sheet ? (
            <p className="text-[12px] leading-snug text-[#8A8896]">
              {answer.kind === 'UPLOADED' ? t('app.sheetUploaded') : t('app.sheetNone')}
            </p>
          ) : sheet.status === 'pending' ? (
            <p role="status" className="text-[12px] leading-snug text-[#6B6878]">
              {t('app.sheetPending')}
            </p>
          ) : sheet.status === 'idle' ? (
            <p className="text-[12px] leading-snug text-[#8A8896]">{t('app.sheetIdle')}</p>
          ) : sheet.status === 'unavailable' ? (
            <p className="text-[12px] leading-snug text-[#8A8896]">{t('app.sheetUnavailable')}</p>
          ) : sheet.status === 'failed' ? (
            <p className="text-[12px] leading-snug text-[#8A8896]">
              {t('app.sheetFailed')}
              {sheet.failure && (
                <span className="ml-1 font-[family-name:var(--font-mono)] text-[11px]">
                  ({sheet.failure})
                </span>
              )}
            </p>
          ) : sheet.lines.length === 0 ? (
            <p className="text-[12px] leading-snug text-[#8A8896]">{t('app.sheetNoLines')}</p>
          ) : (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-[#8A8896]">
                {t('app.sheetLines')}
              </p>
              <ul className="flex flex-col gap-1.5">
                {sheet.lines.map((l, i) => (
                  <li
                    key={i}
                    className="rounded-lg bg-[#F7F7FA] px-2.5 py-1.5 text-[12px] leading-snug text-[#17161F]"
                  >
                    <span className="text-[#6B6878]">{l.color}</span>
                    <span aria-hidden className="mx-1.5 text-[#2948FC]">
                      →
                    </span>
                    <span className="font-medium">{l.material}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-snug text-[#8A8896]">{t('app.sheetHint')}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
