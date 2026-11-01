'use client';

// « Relances » (2026-11-01, owner: « on n'a pas encore décidé du texte du
// mail », then « je veux que ce soit automatique »).
//
// This page sends nothing to anybody. It is where the nine relances are READ
// once, before the automatic pass is switched on: pick one, see it exactly as
// it will land, and — if you want to be sure of your own inbox — have that
// one copy sent to your own address. The sending itself is a daily cron that
// nobody has to touch (api/cron/reengagement), which is why this page says
// plainly whether it is on.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { Locale, TranslationKey } from '@/lib/i18n/dictionaries';
import { useToast } from '@/contexts/ToastContext';
import type { ReengagementStatus } from '@/app/api/admin/reengagement/status/route';

const CARD = 'rounded-[18px] bg-white p-4 min-[640px]:p-5';
const MONO = 'font-[family-name:var(--font-mono)]';

type Kind =
  | 'prospect_day1'
  | 'prospect_day4'
  | 'prospect_day10'
  | 'prospect_day18'
  | 'credits_low'
  | 'idle_subscriber'
  | 'lapsed_day7'
  | 'lapsed_day30'
  | 'winback';

/** The nine, in the order a reader meets them, grouped by who receives them. */
const GROUPS: readonly { group: TranslationKey; kinds: readonly Kind[] }[] = [
  {
    group: 'admin.relances.groupProspect',
    kinds: ['prospect_day1', 'prospect_day4', 'prospect_day10', 'prospect_day18'],
  },
  { group: 'admin.relances.groupSubscriber', kinds: ['credits_low', 'idle_subscriber'] },
  { group: 'admin.relances.groupLapsed', kinds: ['lapsed_day7', 'lapsed_day30'] },
  { group: 'admin.relances.groupDormant', kinds: ['winback'] },
];

const WHEN: Record<Kind, TranslationKey> = {
  prospect_day1: 'admin.relances.whenDay1',
  prospect_day4: 'admin.relances.whenDay4',
  prospect_day10: 'admin.relances.whenDay10',
  prospect_day18: 'admin.relances.whenDay18',
  credits_low: 'admin.relances.whenCreditsLow',
  idle_subscriber: 'admin.relances.whenIdle',
  lapsed_day7: 'admin.relances.whenLapsed7',
  lapsed_day30: 'admin.relances.whenLapsed30',
  winback: 'admin.relances.whenWinback',
};

export default function AdminRelancesPage() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [status, setStatus] = useState<ReengagementStatus | null>(null);
  const [kind, setKind] = useState<Kind>('prospect_day1');
  const [lang, setLang] = useState<Locale>('fr');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<ReengagementStatus>('/api/admin/reengagement/status')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  const sendToSelf = useCallback(async () => {
    setSending(true);
    try {
      const res = await api<{ ok: boolean; to: string }>(
        `/api/admin/reengagement/preview?kind=${kind}&lang=${lang}`,
        { method: 'POST' },
      );
      toast(t('admin.relances.sentTo', { email: res.to }), 'success');
    } catch {
      toast(t('admin.relances.sendFailed'), 'error');
    } finally {
      setSending(false);
    }
  }, [kind, lang, t, toast]);

  const src = `/api/admin/reengagement/preview?kind=${kind}&lang=${lang}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Is the machine running? Said in words, because the whole point is
          that the owner never has to wonder. */}
      {status ? (
        <div
          role="status"
          className={`rounded-[14px] px-4 py-3 text-[13.5px] font-medium ${
            status.enabled && status.mailerConfigured
              ? 'bg-[#E6F4EA] text-[#1E7A3D]'
              : 'bg-[#FDF1DC] text-[#8A5408]'
          }`}
        >
          {!status.mailerConfigured
            ? t('admin.relances.noMailer')
            : status.enabled
              ? t('admin.relances.onAuto')
              : t('admin.relances.offWaiting')}{' '}
          {/* Whether the daily pass actually ran — otherwise nothing on this
              page says so, and the owner has to ask. */}
          <span className={`${MONO} font-normal`}>
            {status.lastSentAt === null
              ? t('admin.relances.neverSent')
              : t('admin.relances.lastSent', {
                  when: new Date(status.lastSentAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                  day: String(status.sentLastDay),
                  total: String(status.sentTotal),
                })}
          </span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-[300px_1fr]">
        <section className={`${CARD} flex flex-col gap-4`}>
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A8896]">
            {t('admin.relances.listTitle')}
          </p>

          {GROUPS.map(({ group, kinds }) => (
            <div key={group} className="flex flex-col gap-1.5">
              <p className="text-[12.5px] font-semibold text-[#3D3B49]">{t(group)}</p>
              {kinds.map((k) => {
                const active = k === kind;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors ${
                      active ? 'bg-[#EEF1FF] text-[#1E36D6]' : 'text-[#17161F] hover:bg-[#F2F2F5]'
                    }`}
                  >
                    <span className="text-[13.5px] font-semibold">
                      {t(`admin.relances.name.${k}` as TranslationKey)}
                    </span>
                    <span className={`text-[11.5px] ${MONO} text-[#6B6878]`}>{t(WHEN[k])}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </section>

        <section className={`${CARD} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(['fr', 'en'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={`h-8 rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
                    lang === l
                      ? 'bg-[#2948FC] text-white'
                      : 'bg-[#F2F2F5] text-[#3D3B49] hover:bg-[#E9E9EE]'
                  }`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={sendToSelf}
              disabled={sending || !status?.mailerConfigured}
              className="h-10 rounded-xl bg-[#2948FC] px-4 text-[13.5px] font-semibold text-white hover:bg-[#1E36D6] disabled:opacity-50"
            >
              {sending ? t('admin.relances.sending') : t('admin.relances.sendToMe')}
            </button>
          </div>

          <iframe
            key={src}
            src={src}
            title={t('admin.relances.previewTitle')}
            className="h-[70vh] min-h-[420px] w-full rounded-[14px] bg-[#EEEEF1]"
          />

          <p className="text-[12px] leading-relaxed text-[#8A8896]">
            {t('admin.relances.previewNote')}
          </p>
        </section>
      </div>
    </div>
  );
}
