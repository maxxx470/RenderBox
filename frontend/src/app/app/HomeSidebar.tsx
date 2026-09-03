'use client';

// Sidebar for the /app home ("Espace de génération") and for the dashboard —
// distinct from ModeSidebar (used inside an open project: same output-kind
// entries, but with a render tree underneath instead of project nav +
// account). No link to
// /admin here, ever — the admin back-office is a fully separate space
// reached by typing the URL directly, never surfaced from this sidebar.
import Link from 'next/link';
import {
  Category,
  Image as ImageIcon,
  InfoSquare,
  Setting,
  ChevronLeft,
  ChevronRight,
  User,
} from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { PricingTierId } from '@/lib/pricing-tiers';
import type { AppMode } from './CommandBar';
import { VideoModeSoon } from './VideoModeSoon';
import { useSidebarCollapsed } from './useSidebarCollapsed';

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
  onModeChange,
  tier,
  max,
  remaining,
  userEmail,
  mobileOpen = false,
  onMobileClose,
}: {
  /** Absent on the dashboard, which has no mode state — the Image entry
      becomes a link back to the generation space instead of a button. */
  onModeChange?: (mode: AppMode) => void;
  tier: PricingTierId | null;
  max: number | null;
  remaining: number | null;
  userEmail: string;
  /** Below 900px the rail is a drawer. Defaults to closed, so a caller that
      does not wire the trigger simply keeps the old "hidden on mobile"
      behaviour instead of leaking a 240px rail into a 390px screen. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const t = useTranslations();
  const nextTier = tier ? NEXT_TIER[tier] : null;
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  // The drawer only ever opens below 900px (its trigger is `min-[900px]:hidden`),
  // so an open drawer means "narrow screen" and the persisted desktop collapse
  // must not apply — a 68px drawer with no labels would be useless.
  const collapsedUi = mobileOpen ? false : collapsed;
  // Always a function: `exactOptionalPropertyTypes` rejects a possibly-undefined
  // onClick, and every nav item wants to dismiss the drawer it was tapped in.
  const closeDrawer = () => {
    onMobileClose?.();
  };
  const hideOnCollapse = collapsedUi ? 'hidden' : '';
  const centerOnCollapse = collapsedUi ? 'justify-center px-0' : '';
  const showUpgradeBanner = !collapsedUi && (!tier || Boolean(nextTier));

  return (
    <aside
      // Two layouts, one element.
      //
      // Below 900px it is an overlay drawer (`fixed`, off-canvas until opened) —
      // a 240px rail inside a 390px screen would eat the workspace, which is
      // exactly what broke /app/generer on phones.
      //
      // From 900px it is the pinned rail: `sticky top-0` plus a height that
      // subtracts its own margins, so it never scrolls with the page and never
      // overflows past the bottom edge. The page beside it scrolls freely, and
      // `overflow-y-auto` is deliberately absent there — the whole point is
      // that the rail fits. The account block and the upgrade banner are pushed
      // down with `mt-auto` instead of being scrolled to.
      className={`${mobileOpen ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 flex-col overflow-y-auto border-r border-[#DEDEE8] bg-[#F7F7FA] py-4.5 transition-[width] duration-200 ease-out min-[900px]:sticky min-[900px]:top-0 min-[900px]:z-auto min-[900px]:m-2.5 min-[900px]:flex min-[900px]:h-[calc(100vh-20px)] min-[900px]:flex-shrink-0 min-[900px]:overflow-visible min-[900px]:rounded-2xl min-[900px]:border ${
        collapsedUi ? 'w-[68px] px-2.5' : 'w-[240px] px-3.5'
      }`}
    >
      <div
        className={`mb-3 flex items-center gap-2.5 ${collapsedUi ? 'justify-center' : 'px-1.5'}`}
      >
        <div className="h-6.5 w-6.5 flex-shrink-0 rounded-[7px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]" />
        <span
          className={`font-[family-name:var(--font-general-sans)] text-[14.5px] font-semibold text-[#17161F] ${hideOnCollapse}`}
        >
          RenderBox
        </span>
      </div>

      {/* Collapsing is a desktop affordance: the drawer is already dismissed by
          the backdrop, and a 68px drawer would defeat its own purpose. */}
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={t(collapsedUi ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
        title={t(collapsedUi ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
        className={`mb-4 hidden h-8 w-8 items-center justify-center rounded-lg border border-[#ECECF2] bg-white transition-colors hover:border-[#DEDEE8] min-[900px]:flex ${
          collapsedUi ? 'self-center' : 'self-end'
        }`}
      >
        {collapsedUi ? (
          <ChevronRight set="light" size={15} primaryColor="#8A8896" />
        ) : (
          <ChevronLeft set="light" size={15} primaryColor="#8A8896" />
        )}
      </button>

      <div className="mb-4.5">
        <Link
          href="/app"
          {...(collapsedUi ? { title: t('dashboard.title') } : {})}
          onClick={closeDrawer}
          aria-label={t('dashboard.title')}
          className={`flex items-center gap-2.5 rounded-xl border border-[#DEDEE8] bg-white px-3 py-2.5 text-[13.5px] font-semibold text-[#17161F] shadow-[0_1px_4px_#17161F14] ${centerOnCollapse}`}
        >
          <Category set="light" size={16} primaryColor="#716FFF" />
          <span className={hideOnCollapse}>{t('dashboard.title')}</span>
        </Link>
      </div>

      <h3
        className={`mb-2 px-1.5 font-[family-name:var(--font-general-sans)] text-[10.5px] uppercase tracking-wide text-[#8A8896] ${hideOnCollapse}`}
      >
        {t('app.modesLabel')}
      </h3>
      {/* Only the output kind. Generate / retouch / add are now chosen in the
          command bar, next to the action they run. On the dashboard there is
          no mode state at all, so the entry is a plain link back to /app. */}
      <div className="mb-4.5 flex flex-col gap-1">
        {onModeChange ? (
          <button
            type="button"
            onClick={() => {
              onModeChange('generate');
              closeDrawer();
            }}
            {...(collapsedUi ? { title: t('app.modeGenerate') } : {})}
            aria-label={t('app.modeGenerate')}
            aria-current="page"
            className={`flex items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-left text-[13.5px] font-semibold shadow-[0_1px_4px_#17161F14] ${centerOnCollapse}`}
          >
            <ImageIcon set="light" size={16} primaryColor="#716FFF" />
            <span className={hideOnCollapse}>{t('app.modeGenerate')}</span>
          </button>
        ) : (
          <Link
            href="/app/generer"
            {...(collapsedUi ? { title: t('app.modeGenerate') } : {})}
            onClick={closeDrawer}
            aria-label={t('app.modeGenerate')}
            className={`flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-[13.5px] font-medium text-[#17161F] hover:border-[#DEDEE8] hover:bg-white ${centerOnCollapse}`}
          >
            <ImageIcon set="light" size={16} primaryColor="#8A8896" />
            <span className={hideOnCollapse}>{t('app.modeGenerate')}</span>
          </Link>
        )}
        <VideoModeSoon
          collapsed={collapsedUi}
          className={`text-[13.5px] ${centerOnCollapse}`}
          labelClassName={hideOnCollapse}
        />
      </div>

      <h3
        className={`mb-2 px-1.5 font-[family-name:var(--font-general-sans)] text-[10.5px] uppercase tracking-wide text-[#8A8896] ${hideOnCollapse}`}
      >
        {t('app.accountLabel')}
      </h3>
      <div className="mb-4.5 flex flex-col gap-1">
        <Link
          href="/parametres"
          {...(collapsedUi ? { title: t('parametres.title') } : {})}
          onClick={closeDrawer}
          aria-label={t('parametres.title')}
          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-[#17161F] hover:bg-[#F1F0F6] ${centerOnCollapse}`}
        >
          <Setting set="light" size={16} primaryColor="#8A8896" />
          <span className={hideOnCollapse}>{t('parametres.title')}</span>
        </Link>
        <Link
          href="/info"
          {...(collapsedUi ? { title: t('info.title') } : {})}
          onClick={closeDrawer}
          aria-label={t('info.title')}
          className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-medium text-[#17161F] hover:bg-[#F1F0F6] ${centerOnCollapse}`}
        >
          <InfoSquare set="light" size={16} primaryColor="#8A8896" />
          <span className={hideOnCollapse}>{t('info.title')}</span>
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
        className={`flex items-center gap-2.5 rounded-xl py-2 ${collapsedUi ? 'justify-center px-0' : 'px-2.5'} ${showUpgradeBanner ? '' : 'mt-auto'}`}
        {...(collapsedUi ? { title: userEmail } : {})}
      >
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
          <User set="light" size={14} primaryColor="#ffffff" />
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
