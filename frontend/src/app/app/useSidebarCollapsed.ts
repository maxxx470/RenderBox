'use client';

import { useCallback, useEffect, useState } from 'react';

// Shared by both rails (HomeSidebar on /app, ModeSidebar inside a project) so
// the preference carries across the two screens.
const STORAGE_KEY = 'renderbox:sidebar-collapsed';

/**
 * Collapsed state for the left rail, remembered per browser.
 *
 * Read after mount rather than during render: the server has no localStorage,
 * so seeding the initial state from it would desync the first client render.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Blocked storage (private mode, hardened browser) — stay expanded.
    }
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        // Non-fatal — the choice just won't survive a reload.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
