'use client';

// The one app rail: dashboard, generation space, every in-app page AND the
// open project workspace (which passes its render tree as `children`). A
// separate ModeSidebar used to serve the workspace — logo in a top bar
// instead of the rail, no Exemples/Paramètres, no account card — so opening a
// project looked like a different product. No link to
// /admin here, ever — the admin back-office is a fully separate space
// reached by typing the URL directly, never surfaced from this sidebar.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Chat, Login, Logout } from 'react-iconly';
import { openAssistant } from './AssistantWidget';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { isPlaceholderAccount } from '@/lib/account-label';
import { NavPendingIcon } from './NavPending';
import { RailIcon, type RailIconName } from './RailIcon';
import type { AppMode } from './CommandBar';

import { useSidebarCollapsed } from './useSidebarCollapsed';
import { RAIL_CAPTION, RAIL_TOGGLE, ROW, ROW_ACTIVE, ROW_IDLE } from './nav-row';

/**
 * Which rail entry is the page you are on.
 *
 * This used to be inferred — "no onModeChange prop means we must be on the
 * dashboard" — which worked for exactly the two screens that existed then and
 * would silently mark the dashboard active on every screen added since. With
 * Paramètres, Informations and Exemples now living inside the app, the rail
 * has to be told.
 */
export type RailPage =
  | 'dashboard'
  | 'projects'
  | 'generate'
  | 'enhance'
  | 'pricing'
  | 'settings'
  | 'info';

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
  userEmail,
  mobileOpen = false,
  onMobileClose,
  children,
}: {
  /** The rail entry to mark as the current page. */
  current: RailPage;
  /** Absent on every screen but the generation space, which owns the mode
      state — elsewhere the Image entry is a link back to it, not a button. */
  onModeChange?: (mode: AppMode) => void;
  /** Decides the foot button: sign in (free access, no session) or sign out. */
  userEmail: string;
  /** Below 900px the rail is a drawer. Defaults to closed, so a caller that
      does not wire the trigger simply keeps the old "hidden on mobile"
      behaviour instead of leaking a 256px rail into a 390px screen. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** Project-specific block (the render tree). Gets the space between the
      link groups and the bottom pills, and is the only part that scrolls. */
  children?: ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();

  // No account (free-access mode): there is no session to end, so the foot
  // offers to sign in instead of out. See lib/account-label.ts.
  const placeholder = isPlaceholderAccount(userEmail);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  // The drawer only ever opens below 900px (its trigger is `min-[900px]:hidden`),
  // so an open drawer means "narrow screen" and the persisted desktop collapse
  // must not apply — a 72px drawer with no labels would be useless.
  const collapsedUi = mobileOpen ? false : collapsed;
  // Always a function: `exactOptionalPropertyTypes` rejects a possibly-undefined
  // onClick, and every nav item wants to dismiss the drawer it was tapped in.
  const closeDrawer = () => {
    onMobileClose?.();
  };
  const hideOnCollapse = collapsedUi ? 'hidden' : '';

  function link(href: string, label: string, icon: RailIconName, page: RailPage) {
    return (
      <RailLink
        href={href}
        label={label}
        icon={icon}
        active={current === page}
        collapsed={collapsedUi}
        onNavigate={closeDrawer}
      />
    );
  }

  function caption(label: string) {
    return collapsedUi ? (
      <div className="mx-auto my-3 h-px w-8 flex-shrink-0 bg-[#ECECF2]" />
    ) : (
      <p className={`${RAIL_CAPTION} mb-2 mt-5`}>{label}</p>
    );
  }

  async function handleLogout() {
    await logout();
    router.push('/connexion');
  }

  return (
    <aside
      // Layout after the owner's Metrio reference: a full-height white column
      // with a right border (not a floating card), captioned groups, line
      // icons in the brand colour, the current page as a solid pill, and two
      // tinted pills at the foot.
      //
      // Below 900px it is an overlay drawer (`fixed`, off-canvas until opened).
      // From 900px it sits under the header (AppTopbar) and fills the frame
      // height; the page scrolls beside it, only the project tree inside it.
      className={`${mobileOpen ? 'flex' : 'hidden'} fixed bottom-0 left-0 top-16 z-40 flex-col overflow-y-auto border-r border-[#E1E9E3] bg-white py-5 transition-[width] duration-200 ease-out min-[900px]:static min-[900px]:z-auto min-[900px]:flex min-[900px]:flex-shrink-0 ${
        collapsedUi ? 'w-[76px] px-3' : 'w-[264px] px-4'
      }`}
    >
      {/* "NAVIGATION" + the round back-arrow that folds the rail. Collapsing
          is a desktop affordance: the drawer is dismissed by its backdrop. */}
      <div
        className={`flex items-center ${collapsedUi ? 'justify-center' : 'justify-between pl-1'}`}
      >
        <span
          className={`text-[13px] font-semibold uppercase tracking-[0.08em] text-[#3D3B49] ${hideOnCollapse}`}
        >
          {t('app.railNavigation')}
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={t(collapsedUi ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
          title={t(collapsedUi ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
          className={RAIL_TOGGLE}
        >
          {collapsedUi ? (
            <ArrowRight set="light" size={16} primaryColor="#15803D" />
          ) : (
            <ArrowLeft set="light" size={16} primaryColor="#15803D" />
          )}
        </button>
      </div>

      {caption(t('app.railGroupMain'))}
      <nav className="flex flex-col gap-1">
        {link('/app', t('app.railHome'), 'dashboard', 'dashboard')}
        {link('/app/projets', t('app.railProjects'), 'projects', 'projects')}
        {/* On the generation space the Image entry is the mode switch it
            owns; everywhere else it is a link back to that space. */}
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
            className={`${ROW} ${ROW_ACTIVE} text-left ${collapsedUi ? 'justify-center px-0' : ''}`}
          >
            <RailIcon name="image" active />
            <span className={hideOnCollapse}>{t('app.modeGenerate')}</span>
          </button>
        ) : (
          link('/app/generer', t('app.modeGenerate'), 'image', 'generate')
        )}
        {link('/app/enhance', t('app.railEnhance'), 'enhance', 'enhance')}
      </nav>

      {caption(t('app.railGroupLibrary'))}
      <nav className="flex flex-col gap-1">
        {/* /app/info, not /info: the public changelog wears the landing's
            header, and nothing inside the app may lead back there. */}
        {link('/app/info', t('info.title'), 'info', 'info')}
      </nav>

      {caption(t('app.railGroupAccount'))}
      <nav className="flex flex-col gap-1">
        {link('/parametres', t('parametres.title'), 'settings', 'settings')}
        {link('/app/tarifs', t('app.railPricing'), 'pricing', 'pricing')}
      </nav>

      {/* A tree can run to any length; only it scrolls, so the groups and the
          foot stay put. It needs its labels, so it goes when collapsed. */}
      {children && (
        <>
          <div className={`my-4 h-px flex-shrink-0 bg-[#ECECF2] ${hideOnCollapse}`} />
          <div className={`min-h-0 flex-1 overflow-y-auto ${hideOnCollapse}`}>{children}</div>
        </>
      )}

      {/* The foot, as in Metrio: the help chat, then the account button —
          sign in while the app runs in free access (no session), sign out
          once there is one. The plan and renders left moved to the header. */}
      <div className="mt-auto flex flex-col gap-2.5 border-t border-[#ECECF2] pt-4">
        <button
          type="button"
          onClick={() => {
            closeDrawer();
            openAssistant();
          }}
          {...(collapsedUi ? { title: t('app.assistant') } : {})}
          aria-label={t('app.assistant')}
          className={`flex items-center gap-3 rounded-full border border-[#CDEBD6] bg-[#E8F5EC] py-2.5 text-[14px] font-semibold text-[#166534] transition-colors hover:border-[#16A34A] ${
            collapsedUi ? 'justify-center px-0' : 'px-4'
          }`}
        >
          <Chat set="light" size={18} primaryColor="#15803D" />
          <span className={hideOnCollapse}>{t('app.assistant')}</span>
        </button>
        {placeholder ? (
          <Link
            href="/connexion"
            onClick={closeDrawer}
            {...(collapsedUi ? { title: t('landing.navLogin') } : {})}
            aria-label={t('landing.navLogin')}
            className={`flex items-center gap-3 rounded-full border border-[#ECECF2] bg-white py-2.5 text-[14px] font-semibold text-[#17161F] transition-colors hover:border-[#16A34A] ${
              collapsedUi ? 'justify-center px-0' : 'px-4'
            }`}
          >
            <Login set="light" size={18} primaryColor="#15803D" />
            <span className={hideOnCollapse}>{t('landing.navLogin')}</span>
          </Link>
        ) : (
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            {...(collapsedUi ? { title: t('parametres.logoutButton') } : {})}
            aria-label={t('parametres.logoutButton')}
            className={`flex items-center gap-3 rounded-full border border-[#F6CFD0] bg-[#FDEEEE] py-2.5 text-[14px] font-semibold text-[#B4232A] transition-colors hover:border-[#E5484D] disabled:opacity-60 ${
              collapsedUi ? 'justify-center px-0' : 'px-4'
            }`}
          >
            <Logout set="light" size={18} primaryColor="#E5484D" />
            <span className={hideOnCollapse}>{t('parametres.logoutButton')}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
