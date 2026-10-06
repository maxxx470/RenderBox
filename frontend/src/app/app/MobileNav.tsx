'use client';

// The app's navigation below 900px, after the owner's Metrio reference
// (Metrio 4.0, src/layouts/MobileNav.tsx): a white floating pill at the
// bottom of the screen with the three main entries and a "Plus" button
// whose menu holds the rest, and beside it a round green "+" that starts a new
// render. It replaces the old off-canvas rail, which hid the whole app
// behind a small menu button.
//
// The pages that mount it reserve the room it takes with MOBILE_NAV_PAD.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chat, Login, Logout, MoreCircle, Plus } from 'react-iconly';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { isPlaceholderAccount } from '@/lib/account-label';
import { RailIcon, type RailIconName } from './RailIcon';
import type { RailPage } from './HomeSidebar';
import { AssistantWidget, openAssistant } from './AssistantWidget';

/** Bottom padding for a page that mounts MobileNav: the pill (64px) plus its
 *  margins and the phone's safe area. Nothing from 900px up. */
export const MOBILE_NAV_PAD = 'pb-[calc(104px+env(safe-area-inset-bottom))] min-[900px]:pb-0';

const MORE_PAGES: RailPage[] = ['projects', 'info', 'settings', 'pricing'];

export function MobileNav({
  current,
  userEmail,
  onNew,
}: {
  current: RailPage;
  userEmail: string;
  /** What "+" does. On the generation space it opens the photo picker
      directly; everywhere else it is a link to that space. */
  onNew?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { logout, loggingOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const placeholder = isPlaceholderAccount(userEmail);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  const main: { page: RailPage; href: string; label: string; icon: RailIconName }[] = [
    { page: 'dashboard', href: '/app', label: t('app.railHome'), icon: 'dashboard' },
    { page: 'generate', href: '/app/generer', label: t('app.modeGenerate'), icon: 'image' },
    { page: 'enhance', href: '/app/enhance', label: t('app.railEnhance'), icon: 'enhance' },
  ];
  const more: { page: RailPage; href: string; label: string; icon: RailIconName }[] = [
    { page: 'projects', href: '/app/projets', label: t('app.railProjects'), icon: 'projects' },
    { page: 'info', href: '/app/info', label: t('info.title'), icon: 'info' },
    { page: 'settings', href: '/parametres', label: t('parametres.title'), icon: 'settings' },
    { page: 'pricing', href: '/app/tarifs', label: t('app.railPricing'), icon: 'pricing' },
  ];
  const moreActive = moreOpen || MORE_PAGES.includes(current);

  // One tap target: 56×52, label under the glyph, the current one on the tint.
  const item = (active: boolean) =>
    `flex h-[52px] w-14 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-medium transition-colors duration-150 ${
      active ? 'bg-[#E8F5EC] text-[#166534]' : 'text-[#3D3B49]'
    }`;

  const newClass =
    'ml-3 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#16A34A] via-[#15803D] to-[#166534] shadow-[0_10px_24px_-8px_rgba(21,128,61,0.7)] transition-transform duration-150 active:scale-90';

  return (
    <>
      <nav
        aria-label={t('app.railNavigation')}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 min-[900px]:hidden"
      >
        <div className="pointer-events-auto flex items-end justify-center px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3">
          <div className="flex items-center gap-1 rounded-full border border-[#ECECF2] bg-white/95 p-1.5 shadow-[0_8px_30px_rgba(23,22,31,0.10)] backdrop-blur-md">
            {main.map((m) => {
              const active = current === m.page;
              return (
                <Link
                  key={m.page}
                  href={m.href}
                  aria-label={m.label}
                  {...(active ? { 'aria-current': 'page' as const } : {})}
                  className={item(active)}
                >
                  <RailIcon name={m.icon} />
                  <span>{m.label}</span>
                </Link>
              );
            })}

            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className={item(moreActive)}
              >
                <MoreCircle set="light" size={20} primaryColor="#15803D" />
                <span>{t('app.mobileMore')}</span>
              </button>

              {moreOpen && (
                <div
                  role="menu"
                  className="rb-pop-up absolute bottom-full left-1/2 mb-3 w-56 -translate-x-1/2 rounded-2xl border border-[#ECECF2] bg-white p-2 shadow-[0_12px_32px_rgba(23,22,31,0.14)]"
                >
                  {more.map((m) => {
                    const active = current === m.page;
                    return (
                      <Link
                        key={m.page}
                        href={m.href}
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                        {...(active ? { 'aria-current': 'page' as const } : {})}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
                          active
                            ? 'bg-[#E8F5EC] text-[#166534]'
                            : 'text-[#3D3B49] hover:bg-[#F7F7FA]'
                        }`}
                      >
                        <RailIcon name={m.icon} />
                        {m.label}
                      </Link>
                    );
                  })}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      openAssistant();
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-[#15803D] transition-colors hover:bg-[#E8F5EC]"
                  >
                    <Chat set="light" size={18} primaryColor="#15803D" />
                    {t('app.assistant')}
                  </button>
                  {placeholder ? (
                    <>
                      <div className="my-1 h-px bg-[#ECECF2]" />
                      <Link
                        href="/connexion"
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-[#17161F] transition-colors hover:bg-[#F7F7FA]"
                      >
                        <Login set="light" size={18} primaryColor="#15803D" />
                        {t('landing.navLogin')}
                      </Link>
                    </>
                  ) : (
                    <>
                      <div className="my-1 h-px bg-[#ECECF2]" />
                      <button
                        type="button"
                        role="menuitem"
                        disabled={loggingOut}
                        onClick={async () => {
                          setMoreOpen(false);
                          await logout();
                          router.push('/connexion');
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium text-[#B4232A] transition-colors hover:bg-[#FDEEEE] disabled:opacity-60"
                      >
                        <Logout set="light" size={18} primaryColor="#E5484D" />
                        {t('parametres.logoutButton')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {onNew ? (
            <button
              type="button"
              onClick={onNew}
              aria-label={t('app.mobileNew')}
              className={newClass}
            >
              <Plus set="light" size={26} primaryColor="#ffffff" />
            </button>
          ) : (
            <Link href="/app/generer" aria-label={t('app.mobileNew')} className={newClass}>
              <Plus set="light" size={26} primaryColor="#ffffff" />
            </Link>
          )}
        </div>
      </nav>
      {/* The help chat, opened from the rail or the menu above. Outside the
        nav, which is hidden from 900px. */}
      <AssistantWidget />
    </>
  );
}
