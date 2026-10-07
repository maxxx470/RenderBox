'use client';

// The app's chrome — header bar, rail, bottom bar — mounted ONCE by the app
// layout (app/app/layout.tsx, and parametres/layout.tsx) and kept across
// navigations, as Metrio's AppLayout is.
//
// It used to be rendered by every page (each page wrapped itself in
// AppFrame). Changing page therefore unmounted and rebuilt the whole frame:
// the rail re-read its folded state after mount and visibly unfolded then
// folded again on every click, and nothing on screen answered the click until
// the next page's data had arrived. Now only the page under the chrome
// changes; the rail and the header never move, and the entry you clicked is
// marked at once.
//
// Pages still describe what the chrome should show — their title, the plan
// figures they fetched, a project's render tree — through AppFrame, which
// registers it here (see AppFrame.tsx).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { AppTopbar } from './AppTopbar';
import { HomeSidebar, type RailPage } from './HomeSidebar';
import { MobileNav } from './MobileNav';
import type { AppMode } from './CommandBar';
import { SIDEBAR_COOKIE } from './sidebar-cookie';

export interface ChromeQuota {
  tier: PricingTierId | null;
  max: number | null;
  remaining: number | null;
}

/** What the page under the chrome tells it. */
export interface PageRegistration {
  title: string;
  quota: ChromeQuota;
  hasModeChange: boolean;
  hasNew: boolean;
  hasTree: boolean;
  treeOpen: boolean;
}

export interface PageHandlers {
  onModeChange?: ((mode: AppMode) => void) | undefined;
  onNew?: (() => void) | undefined;
  onTreeClose?: (() => void) | undefined;
}

interface ChromeContext {
  register: (page: PageRegistration | null) => void;
  handlers: MutableRefObject<PageHandlers>;
  /** Where a project's render tree is portalled into the rail. */
  treeSlot: HTMLElement | null;
}

const Ctx = createContext<ChromeContext | null>(null);

export function useAppChrome(): ChromeContext | null {
  return useContext(Ctx);
}

/** Which rail entry a URL belongs to. An open project sits under Projets. */
export function railPageFor(pathname: string): RailPage {
  if (pathname === '/app') return 'dashboard';
  if (pathname.startsWith('/app/projets')) return 'projects';
  if (pathname.startsWith('/app/generer')) return 'generate';
  if (pathname.startsWith('/app/enhance')) return 'enhance';
  if (pathname.startsWith('/app/tarifs')) return 'pricing';
  if (pathname.startsWith('/app/info')) return 'info';
  if (pathname.startsWith('/parametres')) return 'settings';
  return 'projects';
}

const TITLE_KEY: Record<RailPage, TranslationKey> = {
  dashboard: 'dashboard.title',
  projects: 'app.railProjects',
  generate: 'app.genHomeTitle',
  enhance: 'enhance.title',
  pricing: 'tarifs.title',
  info: 'app.railInfo',
  settings: 'parametres.title',
};

export function AppChrome({
  userEmail,
  initialQuota,
  initialCollapsed,
  children,
}: {
  userEmail: string;
  initialQuota: ChromeQuota;
  initialCollapsed: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname() ?? '/app';
  const [page, setPage] = useState<PageRegistration | null>(null);
  // The freshest figures any page has reported: a page that just spent a
  // render knows the new count before the layout (which never re-renders on
  // a client navigation) could.
  const [quota, setQuota] = useState<ChromeQuota>(initialQuota);
  const handlers = useRef<PageHandlers>({});
  const [treeSlot, setTreeSlot] = useState<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  // The rail entry just clicked, shown as current before the page arrives.
  const [pendingPage, setPendingPage] = useState<RailPage | null>(null);

  useEffect(() => {
    setPendingPage(null);
  }, [pathname]);

  const register = useCallback((next: PageRegistration | null) => {
    setPage(next);
    if (next) setQuota(next.quota);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`;
      } catch {
        // Non-fatal — the choice just won't survive a reload.
      }
      return next;
    });
  }, []);

  const ctx = useMemo<ChromeContext>(
    () => ({ register, handlers, treeSlot }),
    [register, treeSlot],
  );

  const current = pendingPage ?? railPageFor(pathname);
  const title = page?.title || t(TITLE_KEY[railPageFor(pathname)]);

  return (
    <Ctx.Provider value={ctx}>
      <div className="flex h-dvh flex-col overflow-hidden bg-white">
        <AppTopbar
          title={title}
          tier={quota.tier}
          quotaMax={quota.max}
          quotaRemaining={quota.remaining}
          userEmail={userEmail}
        />
        <div className="relative flex min-h-0 flex-1">
          <HomeSidebar
            current={current}
            userEmail={userEmail}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            onNavigateTo={(p) => {
              if (p !== railPageFor(pathname)) setPendingPage(p);
            }}
            mobileOpen={page?.treeOpen ?? false}
            onMobileClose={() => handlers.current.onTreeClose?.()}
            {...(page?.hasModeChange
              ? { onModeChange: (m: AppMode) => handlers.current.onModeChange?.(m) }
              : {})}
            treeSlotRef={page?.hasTree ? setTreeSlot : null}
          />
          {children}
        </div>
        <MobileNav
          current={current}
          userEmail={userEmail}
          {...(page?.hasNew ? { onNew: () => handlers.current.onNew?.() } : {})}
        />
      </div>
    </Ctx.Provider>
  );
}
