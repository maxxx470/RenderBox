'use client';

// The one frame every app screen sits in, after Metrio's AppLayout: the
// header bar across the top, the rail under it on the left, the screen's own
// <main> beside the rail, and below 900px the bottom bar instead of the rail.
//
// The frame is exactly the viewport tall and the page scrolls inside its
// <main>, as in Metrio — the header and the rail never move.
import type { ReactNode } from 'react';
import { AppTopbar, type AppTopbarProps } from './AppTopbar';
import { HomeSidebar, type RailPage } from './HomeSidebar';
import { MobileNav } from './MobileNav';
import type { AppMode } from './CommandBar';

export function AppFrame({
  current,
  topbar,
  onModeChange,
  sidebarOpen = false,
  onSidebarClose,
  sidebarChildren,
  onNew,
  children,
}: {
  current: RailPage;
  topbar: AppTopbarProps;
  /** The generation space owns the mode; see HomeSidebar. */
  onModeChange?: (mode: AppMode) => void;
  /** The project editor's drawer (its render tree) below 900px. */
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
  sidebarChildren?: ReactNode;
  /** What the mobile "+" does; a link to /app/generer when absent. */
  onNew?: () => void;
  /** The screen's own <main>, which carries `min-w-0 flex-1` and scrolls. */
  children: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white">
      <AppTopbar {...topbar} />
      <div className="relative flex min-h-0 flex-1">
        <HomeSidebar
          current={current}
          userEmail={topbar.userEmail}
          mobileOpen={sidebarOpen}
          {...(onModeChange ? { onModeChange } : {})}
          {...(onSidebarClose ? { onMobileClose: onSidebarClose } : {})}
        >
          {sidebarChildren}
        </HomeSidebar>
        {children}
      </div>
      <MobileNav current={current} userEmail={topbar.userEmail} {...(onNew ? { onNew } : {})} />
    </div>
  );
}
