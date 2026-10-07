'use client';

// The one app rail, mounted once by AppChrome and kept across navigations:
// dashboard, projects, generation space, every in-app page AND the open
// project workspace (whose render tree is portalled into `treeSlotRef`).
// No link to /admin here, ever — the admin back-office is a fully separate
// space reached by typing the URL directly, never surfaced from this sidebar.
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
import {
  RAIL_CAPTION,
  RAIL_TOGGLE,
  ROW,
  ROW_ACTIVE,
  ROW_IDLE,
  ROW_ROUND,
  ROW_WIDE,
} from './nav-row';

/**
 * Which rail entry is the page you are on. AppChrome derives it from the URL
 * (see railPageFor), and marks a clicked entry at once, before its page
 * arrives.
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
 * The two foot pills, wide or round like the rows above them.
 * Full literal strings (Tailwind JIT, see CLAUDE.md).
 */
const FOOT_WIDE = 'w-full gap-3 px-4 py-2.5';
const FOOT_ROUND = 'mx-auto h-11 w-11 justify-center p-0';

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
      className={`${ROW} ${collapsed ? ROW_ROUND : ROW_WIDE} ${active ? ROW_ACTIVE : ROW_IDLE} text-left`}
    >
      <NavPendingIcon>
        <RailIcon name={icon} active={active} />
      </NavPendingIcon>
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export function HomeSidebar({
  current,
  onModeChange,
  userEmail,
  collapsed,
  onToggleCollapsed,
  onNavigateTo,
  mobileOpen = false,
  onMobileClose,
  treeSlotRef,
}: {
  /** The rail entry to mark as the current page. */
  current: RailPage;
  /** Only on screens that own the generation mode (the generation space and
      an open project): the Image entry becomes the switch back to "Générer". */
  onModeChange?: (mode: AppMode) => void;
  /** Decides the foot button: sign in (free access, no session) or sign out. */
  userEmail: string;
  /** Folded to icons only. Owned by AppChrome, remembered in a cookie. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Told which entry was clicked, so it is marked before its page arrives. */
  onNavigateTo: (page: RailPage) => void;
  /** Below 900px the rail is a drawer, opened only by an open project for
      its render tree. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** Present when the page has a render tree to show here. */
  treeSlotRef: ((el: HTMLElement | null) => void) | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();

  // No account (free-access mode): there is no session to end, so the foot
  // offers to sign in instead of out. See lib/account-label.ts.
  const placeholder = isPlaceholderAccount(userEmail);
  // An open drawer means a narrow screen: the desktop fold must not apply —
  // a 76px drawer with no labels would be useless.
  const folded = mobileOpen ? false : collapsed;

  function link(href: string, label: string, icon: RailIconName, page: RailPage) {
    return (
      <RailLink
        href={href}
        label={label}
        icon={icon}
        active={current === page}
        collapsed={folded}
        onNavigate={() => {
          onNavigateTo(page);
          onMobileClose?.();
        }}
      />
    );
  }

  function caption(label: string) {
    return folded ? (
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
      // Below 900px an overlay drawer (`fixed`, off-canvas until opened);
      // from 900px it sits under the header and fills the frame height.
      className={`${mobileOpen ? 'flex' : 'hidden'} fixed bottom-0 left-0 top-16 z-40 flex-col overflow-y-auto overflow-x-hidden border-r border-[#ECECF2] bg-white py-5 transition-[width,padding] duration-200 ease-out min-[900px]:static min-[900px]:z-auto min-[900px]:flex min-[900px]:flex-shrink-0 ${
        folded ? 'w-[76px] px-2' : 'w-[264px] px-4'
      }`}
    >
      {/* "NAVIGATION" + the round arrow that folds the rail. */}
      <div className={`flex items-center ${folded ? 'justify-center' : 'justify-between pl-1'}`}>
        {!folded && (
          <span className="whitespace-nowrap text-[13px] font-semibold uppercase tracking-[0.08em] text-[#3D3B49]">
            {t('app.railNavigation')}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={t(folded ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
          title={t(folded ? 'app.sidebarExpand' : 'app.sidebarCollapse')}
          className={RAIL_TOGGLE}
        >
          {folded ? (
            <ArrowRight set="curved" size={16} primaryColor="#15803D" />
          ) : (
            <ArrowLeft set="curved" size={16} primaryColor="#15803D" />
          )}
        </button>
      </div>

      {caption(t('app.railGroupMain'))}
      <nav className="flex flex-col gap-1">
        {link('/app', t('app.railHome'), 'dashboard', 'dashboard')}
        {link('/app/projets', t('app.railProjects'), 'projects', 'projects')}
        {/* Where the page owns the generation mode, the Image entry is the
            switch back to "Générer"; everywhere else a link to that space. */}
        {onModeChange && current === 'generate' ? (
          <button
            type="button"
            onClick={() => {
              onModeChange('generate');
              onMobileClose?.();
            }}
            {...(folded ? { title: t('app.modeGenerate') } : {})}
            aria-label={t('app.modeGenerate')}
            aria-current="page"
            className={`${ROW} ${folded ? ROW_ROUND : ROW_WIDE} ${ROW_ACTIVE} text-left`}
          >
            <RailIcon name="image" active />
            {!folded && <span>{t('app.modeGenerate')}</span>}
          </button>
        ) : (
          link('/app/generer', t('app.modeGenerate'), 'image', 'generate')
        )}
        {link('/app/enhance', t('app.railEnhance'), 'enhance', 'enhance')}
        {/* "Info" sits in PRINCIPAL, as in Metrio (owner, 2026-10-07). It is
            /app/info, not /info: the public changelog wears the landing's
            header, and nothing inside the app may lead back there. */}
        {link('/app/info', t('app.railInfo'), 'info', 'info')}
      </nav>

      {caption(t('app.railGroupAccount'))}
      <nav className="flex flex-col gap-1">
        {link('/parametres', t('parametres.title'), 'settings', 'settings')}
        {link('/app/tarifs', t('app.railPricing'), 'pricing', 'pricing')}
      </nav>

      {/* A project's render tree, portalled here by AppFrame. Only it
          scrolls, so the groups and the foot stay put. It needs its labels,
          so it goes when folded. */}
      {treeSlotRef && (
        <>
          <div className={`my-4 h-px flex-shrink-0 bg-[#ECECF2] ${folded ? 'hidden' : ''}`} />
          <div
            ref={treeSlotRef}
            className={`min-h-0 flex-1 overflow-y-auto ${folded ? 'hidden' : ''}`}
          />
        </>
      )}

      {/* The foot, as in Metrio: the help chat on the brand tint, then the
          account button on Metrio's pale red ("Déconnexion") — "Se connecter"
          while the app runs in free access, "Se déconnecter" with a session. */}
      <div className="mt-auto flex flex-col gap-2.5 border-t border-[#ECECF2] pt-4">
        <button
          type="button"
          onClick={() => {
            onMobileClose?.();
            openAssistant();
          }}
          {...(folded ? { title: t('app.assistant') } : {})}
          aria-label={t('app.assistant')}
          className={`flex items-center rounded-full border border-[#CDEBD6] bg-[#E8F5EC] text-[14px] font-semibold text-[#166534] transition-colors hover:bg-[#CDEBD6] ${
            folded ? FOOT_ROUND : FOOT_WIDE
          }`}
        >
          <Chat set="curved" size={18} primaryColor="#15803D" />
          {!folded && <span>{t('app.assistant')}</span>}
        </button>
        {placeholder ? (
          <Link
            href="/connexion"
            onClick={() => onMobileClose?.()}
            {...(folded ? { title: t('landing.navLogin') } : {})}
            aria-label={t('landing.navLogin')}
            className={`flex items-center rounded-full border border-[#D6432A1A] bg-[#FCEDEA]/80 text-[14px] font-semibold text-[#C2361F] transition-colors hover:bg-[#FCEDEA] ${
              folded ? FOOT_ROUND : FOOT_WIDE
            }`}
          >
            <Login set="curved" size={18} primaryColor="#D6432A" />
            {!folded && <span>{t('landing.navLogin')}</span>}
          </Link>
        ) : (
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => void handleLogout()}
            {...(folded ? { title: t('parametres.logoutButton') } : {})}
            aria-label={t('parametres.logoutButton')}
            className={`flex items-center rounded-full border border-[#D6432A1A] bg-[#FCEDEA]/80 text-[14px] font-semibold text-[#C2361F] transition-colors hover:bg-[#FCEDEA] disabled:opacity-60 ${
              folded ? FOOT_ROUND : FOOT_WIDE
            }`}
          >
            <Logout set="curved" size={18} primaryColor="#D6432A" />
            {!folded && <span>{t('parametres.logoutButton')}</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
