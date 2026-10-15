'use client';

// How a page talks to the app chrome (AppChrome: header bar, rail, bottom
// bar), which the app layout mounts once and keeps across navigations — as
// Metrio's AppLayout does.
//
// The page renders its own <main> as children, exactly where the chrome
// leaves room for it, and tells the chrome the rest: its title, the plan
// figures it fetched, what the rail's Image entry should do, and — for an
// open project — the render tree, portalled into the rail.
//
// Rendered without the chrome (a page outside the app layout), it simply
// renders its children.
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AppTopbarProps } from './AppTopbar';
import type { RailPage } from './HomeSidebar';
import type { AppMode } from './CommandBar';
import { useAppChrome } from './AppChrome';

// useLayoutEffect so the header shows the page's title in the same paint as
// the page; plain useEffect on the server, where layout effects do not run.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function AppFrame({
  topbar,
  onModeChange,
  sidebarOpen = false,
  onSidebarClose,
  sidebarChildren,
  children,
}: {
  /** Kept for the call sites; the chrome derives the current entry from the URL. */
  current?: RailPage;
  /** The account itself comes from the layout; the title and figures from here. */
  topbar: AppTopbarProps;
  /** The generation space owns the mode; see HomeSidebar. */
  onModeChange?: (mode: AppMode) => void;
  /** The project editor's drawer (its render tree) below 900px. */
  sidebarOpen?: boolean;
  onSidebarClose?: () => void;
  sidebarChildren?: ReactNode;
  /** The screen's own <main>, which carries `min-w-0 flex-1` and scrolls. */
  children: ReactNode;
}) {
  const chrome = useAppChrome();
  const register = chrome?.register;
  const handlers = chrome?.handlers;

  // Handlers change identity on every render; the chrome calls through a ref.
  useIsoLayoutEffect(() => {
    if (handlers) handlers.current = { onModeChange, onTreeClose: onSidebarClose };
  });

  const { title, shortTitle, tier, creditsMax, creditsBalance } = topbar;
  const hasModeChange = Boolean(onModeChange);
  const hasTree = Boolean(sidebarChildren);
  useIsoLayoutEffect(() => {
    register?.({
      title,
      shortTitle,
      quota: { tier, max: creditsMax, remaining: creditsBalance },
      hasModeChange,
      hasTree,
      treeOpen: sidebarOpen,
    });
  }, [
    register,
    title,
    shortTitle,
    tier,
    creditsMax,
    creditsBalance,
    hasModeChange,
    hasTree,
    sidebarOpen,
  ]);

  // Leaving the page: the next one starts from the chrome's defaults.
  useIsoLayoutEffect(() => {
    return () => {
      register?.(null);
      if (handlers) handlers.current = {};
    };
  }, [register, handlers]);

  return (
    <>
      {children}
      {sidebarChildren && chrome?.treeSlot ? createPortal(sidebarChildren, chrome.treeSlot) : null}
    </>
  );
}
