'use client';

// Sidebar for the /app home ("Espace de génération") — distinct from
// ModeSidebar (used inside an open project: same 3 mode buttons, but with a
// render tree underneath instead of project nav + account). No link to
// /admin here, ever — the admin back-office is a fully separate space
// reached by typing the URL directly, never surfaced from this sidebar.
import Link from 'next/link';
import {
  Folder,
  Image as ImageIcon,
  Edit,
  PaperPlus,
  Setting,
  ChevronLeft,
  ChevronRight,
  User,
} from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { PricingTierId } from '@/lib/pricing-tiers';
import type { AppMode } from './CommandBar';
import { useSidebarCollapsed } from './useSidebarCollapsed';

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
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const hideOnCollapse = collapsed ? 'hidden' : '';
  const centerOnCollapse = collapsed ? 'justify-center px-0' : '';
  const showUpgradeBanner = !collapsed && (!tier || Boolean(nextTier));

  return (
    <aside
      className={`flex flex-shrink-0 flex-col overflow-y-auto border-r border-[#ECECF2] bg-[#F7F7FA] py-4.5 transition-[width] duration-200 ease-out ${
        collapsed ? 'w-[68px] px-2.5' : 'w-[240px] px-3.5'
      }`}
    >
      <div className={`mb-3 flex items-center gap-2.5 ${collapsed ? 'justify-center' : 'px-1.5'}`}>
        <div className="h-6.5 w-6.5 flex-shrink-0 rounded-[7px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]" />
        <span
          className={`font-[family-name:var(--font-general-sans)] text-[14.5px] font-semibold text-[#17161F] ${hideOnCollapse}`}
        >
          RenderBox
        </span>
      </div>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={t(collapsed ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
        title={t(collapsed ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
        className={`mb-4 flex h-8 w-8 items-center justify-center rounded-lg border border-[#ECECF2] bg-white transition-colors hover:border-[#DEDEE8] ${
          collapsed ? 'self-center' : 'self-end'
        }`}
      >
        {collapsed ? (
          <ChevronRight set="bold" size={15} primaryColor="#8A8896" />
        ) : (
          <ChevronLeft set="bold" size={15} primaryColor="#8A8896" />
        )}
      </button>

      <div className="mb-4.5">
        <Link
          href="/app/projets"
          {...(collapsed ? { title: t('projects.title') } : {})}
          aria-label={t('projects.title')}
          className={`flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-[13.5px] font-semibold text-[#17161F] shadow-[0_1px_4px_#17161F14] ${centerOnCollapse}`}
        >
          <Folder set="bold" size={16} primaryColor="#716FFF" />
          <span className={hideOnCollapse}>{t('projects.title')}</span>
        </Link>
      </div>

      <h3
        className={`mb-2 px-1.5 font-[family-name:var(--font-general-sans)] text-[10.5px] uppercase tracking-wide text-[#8A8896] ${hideOnCollapse}`}
      >
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
              {...(collapsed ? { title: t(MODE_LABEL_KEY[m]) } : {})}
              aria-label={t(MODE_LABEL_KEY[m])}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors ${centerOnCollapse} ${
                active
                  ? 'bg-white font-semibold shadow-[0_1px_4px_#17161F14]'
                  : 'text-[#17161F] hover:bg-[#F1F0F6]'
              }`}
            >
              <Icon set="bold" size={16} primaryColor={active ? '#716FFF' : '#8A8896'} />
              <span className={hideOnCollapse}>{t(MODE_LABEL_KEY[m])}</span>
            </button>
          );
        })}
      </div>

      <h3
        className={`mb-2 px-1.5 font-[family-name:var(--font-general-sans)] text-[10.5px] uppercase tracking-wide text-[#8A8896] ${hideOnCollapse}`}
      >
        {t('app.accountLabel')}
      </h3>
      <div className="mb-4.5 flex flex-col gap-1">
        <Link
          href="/parametres"
          {...(collapsed ? { title: t('parametres.title') } : {})}
          aria-label={t('parametres.title')}
          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-[#17161F] hover:bg-[#F1F0F6] ${centerOnCollapse}`}
        >
          <Setting set="bold" size={16} primaryColor="#8A8896" />
          <span className={hideOnCollapse}>{t('parametres.title')}</span>
        </Link>
      </div>

      {/* Dropped rather than squeezed when collapsed: the label is a full
          sentence, and there is no icon that carries "upgrade to Pro" alone. */}
      {showUpgradeBanner &&
        (!tier ? (
          <Link
            href="/#tarifs"
            className="mb-3 mt-auto flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3.5 py-3 text-white"
          >
            <span className="text-[12.5px] font-semibold">{t('app.genHomeChooseTier')}</span>
          </Link>
        ) : nextTier ? (
          <Link
            href="/parametres"
            className="mb-3 mt-auto flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3.5 py-3 text-white"
          >
            <span className="text-[12.5px] font-semibold">
              {t('app.upgradeBannerLabel', { tier: t(TIER_LABEL_KEY[nextTier]) })}
            </span>
          </Link>
        ) : null)}

      <div
        className={`flex items-center gap-2.5 rounded-xl py-2 ${collapsed ? 'justify-center px-0' : 'px-2.5'} ${showUpgradeBanner ? '' : 'mt-auto'}`}
        {...(collapsed ? { title: userEmail } : {})}
      >
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
          <User set="bold" size={14} primaryColor="#ffffff" />
        </div>
        <div className={`min-w-0 ${hideOnCollapse}`}>
          <div className="truncate text-[12.5px] font-medium text-[#17161F]">{userEmail}</div>
          <div className="font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] text-[#8A8896]">
            {tier ? t(TIER_LABEL_KEY[tier]) : t('app.noTierLabel')}
          </div>
          {tier && max !== null && remaining !== null ? (
            <div className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#8A8896]">
              {t('app.quotaLabel', { used: max - remaining, max })}
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
