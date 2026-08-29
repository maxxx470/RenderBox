'use client';

// Sidebar for the /app home ("Espace de génération") — distinct from
// ModeSidebar (used inside an open project: same 3 mode buttons, but with a
// render tree underneath instead of project nav + account). No link to
// /admin here, ever — the admin back-office is a fully separate space
// reached by typing the URL directly, never surfaced from this sidebar.
import Link from 'next/link';
import { Folder, Image as ImageIcon, Edit, PaperPlus, Setting } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { PricingTierId } from '@/lib/pricing-tiers';
import type { AppMode } from './CommandBar';

const MODE_ICON = { generate: ImageIcon, retouch: Edit, add: PaperPlus } as const;
const MODE_LABEL_KEY = {
  generate: 'app.modeGenerate',
  retouch: 'app.modeRetouch',
  add: 'app.modeAdd',
} as const;

const TIER_LABEL_KEY: Record<
  PricingTierId,
  'app.tierDecouverte' | 'app.tierStandard' | 'app.tierPro'
> = {
  decouverte: 'app.tierDecouverte',
  standard: 'app.tierStandard',
  pro: 'app.tierPro',
};

const NEXT_TIER: Record<PricingTierId, PricingTierId | null> = {
  decouverte: 'standard',
  standard: 'pro',
  pro: null,
};

export function HomeSidebar({
  mode,
  onModeChange,
  tier,
  max,
  remaining,
  userEmail,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  tier: PricingTierId | null;
  max: number | null;
  remaining: number | null;
  userEmail: string;
}) {
  const t = useTranslations();
  const nextTier = tier ? NEXT_TIER[tier] : null;

  return (
    <aside className="flex w-[240px] flex-shrink-0 flex-col border-r border-[#ECE3E5] bg-[#F8F5F6] px-3.5 py-4.5">
      <div className="mb-5 flex items-center gap-2.5 px-1.5">
        <div className="h-6.5 w-6.5 rounded-[7px] bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
        <span className="font-[family-name:var(--font-poppins)] text-[14.5px] font-semibold text-[#170608]">
          RenderBox
        </span>
      </div>

      <div className="mb-4.5">
        <Link
          href="/app/projets"
          className="flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-[13.5px] font-semibold text-[#170608] shadow-[0_1px_4px_#17060814]"
        >
          <Folder set="bold" size={16} primaryColor="#C81120" />
          {t('projects.title')}
        </Link>
      </div>

      <h3 className="mb-2 px-1.5 font-[family-name:var(--font-poppins)] text-[10.5px] uppercase tracking-wide text-[#7A6E71]">
        {t('app.modesLabel')}
      </h3>
      <div className="mb-4.5 flex flex-col gap-1">
        {(['generate', 'retouch', 'add'] as const).map((m) => {
          const Icon = MODE_ICON[m];
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onModeChange(m)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${
                active
                  ? 'bg-white font-semibold shadow-[0_1px_4px_#17060814]'
                  : 'text-[#170608] hover:bg-[#F1EBEC]'
              }`}
            >
              <Icon set="bold" size={16} primaryColor={active ? '#C81120' : '#7A6E71'} />
              {t(MODE_LABEL_KEY[m])}
            </button>
          );
        })}
      </div>

      <h3 className="mb-2 px-1.5 font-[family-name:var(--font-poppins)] text-[10.5px] uppercase tracking-wide text-[#7A6E71]">
        {t('app.accountLabel')}
      </h3>
      <div className="mb-4.5 flex flex-col gap-1">
        <Link
          href="/parametres"
          className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-[#170608] hover:bg-[#F1EBEC]"
        >
          <Setting set="bold" size={16} primaryColor="#7A6E71" />
          {t('parametres.title')}
        </Link>
      </div>

      {!tier ? (
        <Link
          href="/#tarifs"
          className="mb-3 mt-auto flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-3.5 py-3 text-white"
        >
          <span className="text-[12.5px] font-semibold">{t('app.genHomeChooseTier')}</span>
        </Link>
      ) : nextTier ? (
        <Link
          href="/parametres"
          className="mb-3 mt-auto flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-3.5 py-3 text-white"
        >
          <span className="text-[12.5px] font-semibold">
            {t('app.upgradeBannerLabel', { tier: t(TIER_LABEL_KEY[nextTier]) })}
          </span>
        </Link>
      ) : null}

      <div
        className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 ${!tier || nextTier ? '' : 'mt-auto'}`}
      >
        <div className="h-7 w-7 flex-shrink-0 rounded-lg bg-gradient-to-br from-[#E8121F] to-[#7F0000]" />
        <div className="min-w-0">
          <div className="truncate text-[12.5px] font-medium text-[#170608]">{userEmail}</div>
          <div className="font-[family-name:var(--font-ibm-plex-mono)] text-[10.5px] text-[#7A6E71]">
            {tier ? t(TIER_LABEL_KEY[tier]) : t('app.noTierLabel')}
          </div>
          {tier && max !== null && remaining !== null ? (
            <div className="font-[family-name:var(--font-ibm-plex-mono)] text-[10px] text-[#7A6E71]">
              {t('app.quotaLabel', { used: max - remaining, max })}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
