'use client';

// Sidebar for the /app home ("Espace de génération") and for the dashboard —
// distinct from ModeSidebar (used inside an open project: same output-kind
// entries, but with a render tree underneath instead of project nav +
// account). No link to
// /admin here, ever — the admin back-office is a fully separate space
// reached by typing the URL directly, never surfaced from this sidebar.
import Link from 'next/link';
import { ChevronLeft, ChevronRight, User } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { isPlaceholderAccount } from '@/lib/account-label';
import { NavPendingIcon } from './NavPending';
import { RailIcon, type RailIconName } from './RailIcon';
import type { PricingTierId } from '@/lib/pricing-tiers';
import type { AppMode } from './CommandBar';

import { useSidebarCollapsed } from './useSidebarCollapsed';
import { RAIL_TOGGLE, ROW, ROW_ACTIVE, ROW_IDLE } from './nav-row';

/**
 * Which rail entry is the page you are on.
 *
 * This used to be inferred — "no onModeChange prop means we must be on the
 * dashboard" — which worked for exactly the two screens that existed then and
 * would silently mark the dashboard active on every screen added since. With
 * Paramètres, Informations and Exemples now living inside the app, the rail
 * has to be told.
 */
export type RailPage = 'dashboard' | 'generate' | 'examples' | 'settings' | 'info';

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

/**
 * One rail entry.
 *
 * Five call sites had the same eight lines copy-pasted with one word changed,
 * which is how the collapsed `title`, the `aria-current` and the pending
 * spinner ended up on some rows and not others.
 */
function RailLink({
  href,
  label,
  icon,
  active,
  collapsed,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: RailIconName;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      {...(collapsed ? { title: label } : {})}
      onClick={onNavigate}
      aria-label={label}
      {...(active ? { 'aria-current': 'page' as const } : {})}
      className={`${ROW} ${active ? ROW_ACTIVE : ROW_IDLE} text-left ${
        collapsed ? 'justify-center px-0' : ''
      }`}
    >
      <NavPendingIcon>
        <RailIcon name={icon} active={active} />
      </NavPendingIcon>
      <span className={collapsed ? 'hidden' : ''}>{label}</span>
    </Link>
  );
}

export function HomeSidebar({
  current,
  onModeChange,
  tier,
  max,
  remaining,
  userEmail,
  mobileOpen = false,
  onMobileClose,
}: {
  /** The rail entry to mark as the current page. */
  current: RailPage;
  /** Absent on every screen but the generation space, which owns the mode
      state — elsewhere the Image entry is a link back to it, not a button. */
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

  // No account: name the access mode instead of a seeded test address.
  // See lib/account-label.ts.
  const accountLabel = isPlaceholderAccount(userEmail) ? t('app.freeAccessAccount') : userEmail;
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
  const hasQuota = tier !== null && max !== null && remaining !== null && max > 0;

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
      {/* Brand row. The collapse control sits here, at the end of it.
          It used to own an entire row of its own, right-aligned and attached to
          nothing — 40px of height spent on a control that read as misplaced.
          Collapsed, the rail is 68px wide and the two cannot share a line, so
          the button drops underneath the mark. */}
      <div
        className={`mb-5 flex ${
          collapsedUi ? 'flex-col items-center gap-2.5' : 'items-center gap-2 px-1.5'
        }`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="h-6.5 w-6.5 flex-shrink-0 rounded-[7px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]" />
          <span
            className={`truncate font-[family-name:var(--font-general-sans)] text-[14.5px] font-semibold text-[#17161F] ${hideOnCollapse}`}
          >
            RenderBox
          </span>
        </div>
        {/* Collapsing is a desktop affordance: the drawer is already dismissed
            by the backdrop, and a 68px drawer would defeat its own purpose. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={t(collapsedUi ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
          title={t(collapsedUi ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
          className={RAIL_TOGGLE}
        >
          {collapsedUi ? (
            <ChevronRight set="light" size={15} primaryColor="#8A8896" />
          ) : (
            <ChevronLeft set="light" size={15} primaryColor="#8A8896" />
          )}
        </button>
      </div>

      {/* No uppercase group captions any more. There were two, and the very
          first entry sat above both of them with none of its own — an orphan by
          construction. Five entries in two runs separated by a hairline need no
          captions at all; the labels already say what they are. */}
      <nav className="flex flex-col gap-0.5">
        {/* Active only when you are actually on the dashboard. It used to carry
            the raised-white-card treatment unconditionally, so on /app/generer
            BOTH this entry and "Image" looked selected at the same time — the
            rail said you were in two places at once. */}
        <RailLink
          href="/app"
          label={t('dashboard.title')}
          icon="dashboard"
          active={current === 'dashboard'}
          collapsed={collapsedUi}
          onNavigate={closeDrawer}
        />

        {/* Only the output kind. Generate / retouch / add are now chosen in the
            command bar, next to the action they run. On the dashboard there is
            no mode state at all, so the entry is a plain link back to /app. */}
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
            className={`${ROW} ${ROW_ACTIVE} text-left ${centerOnCollapse}`}
          >
            <RailIcon name="image" active />
            <span className={hideOnCollapse}>{t('app.modeGenerate')}</span>
          </button>
        ) : (
          <RailLink
            href="/app/generer"
            label={t('app.modeGenerate')}
            icon="image"
            active={current === 'generate'}
            collapsed={collapsedUi}
            onNavigate={closeDrawer}
          />
        )}

        {/* Reachable from the rail, not only from a card on the dashboard.
            The gallery used to live outside the app entirely, so opening it
            from here dropped you onto a marketing page carrying the landing's
            header — the rail gone, and no way back but the browser. */}
        <RailLink
          href="/app/exemple"
          label={t('app.railExamples')}
          icon="examples"
          active={current === 'examples'}
          collapsed={collapsedUi}
          onNavigate={closeDrawer}
        />
      </nav>

      {/* Destinations above, account below. A hairline does the work the two
          captions used to do, in 1px instead of two lines of type. */}
      <div className="my-3.5 h-px flex-shrink-0 bg-[#ECECF2]" />

      <nav className="flex flex-col gap-0.5">
        <RailLink
          href="/parametres"
          label={t('parametres.title')}
          icon="settings"
          active={current === 'settings'}
          collapsed={collapsedUi}
          onNavigate={closeDrawer}
        />
        {/* /app/info, not /info. The landing's own Informations page is the
            public changelog, with the marketing header; following it from
            inside the app threw the workspace away mid-session. */}
        <RailLink
          href="/app/info"
          label={t('info.title')}
          icon="info"
          active={current === 'info'}
          collapsed={collapsedUi}
          onNavigate={closeDrawer}
        />
      </nav>

      <div className="mt-auto flex flex-col gap-2.5 pt-4">
        {/* Dropped rather than squeezed when collapsed: the label is a full
            sentence, and there is no icon that carries "upgrade to Pro" alone. */}
        {showUpgradeBanner &&
          (!tier ? (
            <Link
              href="/#tarifs"
              className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3.5 py-3 text-white"
            >
              <span className="text-[12.5px] font-semibold">{t('app.genHomeChooseTier')}</span>
            </Link>
          ) : nextTier ? (
            <Link
              href="/parametres"
              className="flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-3.5 py-3 text-white"
            >
              <span className="text-[12.5px] font-semibold">
                {t('app.upgradeBannerLabel', { tier: t(TIER_LABEL_KEY[nextTier]) })}
              </span>
            </Link>
          ) : null)}

        {/* The account block was three lines of 10-12px, two of them mono grey
            on a grey band — the plan and the remaining quota, the two figures a
            paying user most wants to check, set smaller than anything else on
            screen. It is now a card: the plan is a badge, the quota is a
            figure, and identity and allowance are separated by a hairline
            rather than stacked as one four-part block.

            The progress bar that used to sit here is gone. On /app it was the
            SECOND gauge of the same number on screen — the dashboard's quota
            tile carries one, with the renewal date beside it — so the rail
            was re-drawing, 30cm away, a measurement the page had already
            made. The rail keeps the figure, which is the part that is useful
            on every screen including the ones with no tile; the tile keeps
            the gauge, which is the part that only pays for its space where
            there is room to read it. */}
        {collapsedUi ? (
          <div className="flex justify-center" title={accountLabel}>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
              <User set="light" size={15} primaryColor="#ffffff" />
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#ECECF2] bg-white p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7]">
                <User set="light" size={15} primaryColor="#ffffff" />
              </div>
              <div
                className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-[#17161F]"
                title={accountLabel}
              >
                {accountLabel}
              </div>
            </div>

            <div className="my-2.5 h-px bg-[#ECECF2]" />

            <div className="flex items-center justify-between gap-2">
              {/* #5A57D6, not the brand #716FFF: at 10.5px this is small text,
                  and the brand violet on this tint measures 3.35:1 — under the
                  4.5:1 floor. Same hue, one shade deeper, 4.81:1. */}
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                  tier ? 'bg-[#EFECFF] text-[#5A57D6]' : 'bg-[#F1F0F6] text-[#6B6880]'
                }`}
              >
                {tier ? t(TIER_LABEL_KEY[tier]) : t('app.noTierLabel')}
              </span>
              {hasQuota && (
                <span
                  className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#17161F]"
                  title={t('app.quotaLabel', { remaining, max })}
                >
                  {remaining}/{max}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
