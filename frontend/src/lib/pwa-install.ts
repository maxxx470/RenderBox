'use client';

// Installing RenderPro as an app (2026-10-20, owner: PWA for every device and
// system). Two ways exist, and a page has to say which one applies:
//  - Chrome, Edge, Samsung Internet, Opera, Firefox for Android (and desktop
//    Chrome / Edge on Windows, macOS, Linux, ChromeOS) fire
//    `beforeinstallprompt`: the page keeps the event and shows its own
//    « Installer » button;
//  - Safari (iOS, iPadOS, macOS 14+) never fires it: the user installs from
//    the Share menu (« Sur l'écran d'accueil ») or File menu (« Ajouter au
//    Dock »), so the page shows those steps.
// The event can fire before the page that wants it is open (it fires once, on
// load), so one listener, mounted by the root layout through PwaRegister, keeps
// it for the whole session.
import { useEffect, useState } from 'react';

export type InstallPlatform = 'ios' | 'mac-safari' | 'other';

/** What the browser is, as far as the install steps go. Pure, so it is tested. */
export function detectPlatform(input: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}): InstallPlatform {
  const { userAgent: ua, platform, maxTouchPoints } = input;
  // iPadOS 13+ says it is a Mac: a Mac with a touch screen is an iPad.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1);
  if (ios) return 'ios';
  const safari = /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android/i.test(ua);
  if (safari && /Mac/i.test(platform || ua)) return 'mac-safari';
  return 'other';
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const CHANGE = 'rp:pwa-install-change';

/** Mounted once (PwaRegister): keeps the browser's install offer. */
export function captureInstallPrompt(): () => void {
  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    window.dispatchEvent(new Event(CHANGE));
  };
  const onInstalled = () => {
    deferred = null;
    installed = true;
    window.dispatchEvent(new Event(CHANGE));
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

/** Already running as an installed app (any browser). */
function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    nav.standalone === true
  );
}

export interface InstallState {
  /** Read on the client only: false on the server and on the first render. */
  ready: boolean;
  /** Running as an installed app already. */
  standalone: boolean;
  /** The browser offers a one-click install. */
  canPrompt: boolean;
  platform: InstallPlatform;
  install: () => Promise<void>;
}

export function usePwaInstall(): InstallState {
  const [state, setState] = useState({
    ready: false,
    standalone: false,
    canPrompt: false,
    platform: 'other' as InstallPlatform,
  });

  useEffect(() => {
    const read = () =>
      setState({
        ready: true,
        standalone: installed || isStandalone(),
        canPrompt: deferred !== null,
        platform: detectPlatform({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          maxTouchPoints: navigator.maxTouchPoints,
        }),
      });
    read();
    window.addEventListener(CHANGE, read);
    return () => window.removeEventListener(CHANGE, read);
  }, []);

  async function install() {
    const offer = deferred;
    if (!offer) return;
    await offer.prompt();
    const { outcome } = await offer.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    // The event can be used once; Chrome fires it again later if still eligible.
    deferred = null;
    if (outcome === 'accepted') installed = true;
    window.dispatchEvent(new Event(CHANGE));
  }

  return { ...state, install };
}
