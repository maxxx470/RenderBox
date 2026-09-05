'use client';

// The workspace chrome for every in-app page that is NOT the dashboard, the
// generation space or an open project: Paramètres, Informations, Exemples.
//
// Those three used to be plain top-level routes wearing the landing's own
// header, so following them from inside the app replaced the rail with the
// marketing nav — the workspace simply vanished, and the only way back was the
// browser's back button. They are pages of the application, so they get the
// application's frame.
//
// It is deliberately only the frame. The page's own content comes in as
// children, and everything below 900px behaves exactly as the dashboard does:
// off-canvas rail, a menu button in the header row, a backdrop that dismisses.
import { useState, type ReactNode } from 'react';
import { Category } from 'react-iconly';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { HomeSidebar, type RailPage } from './HomeSidebar';
import type { PricingTierId } from '@/lib/pricing-tiers';

export interface AppSurfaceProps {
  current: RailPage;
  tier: PricingTierId | null;
  quotaMax: number | null;
  quotaRemaining: number | null;
  userEmail: string;
}

export function AppSurface({
  current,
  tier,
  quotaMax,
  quotaRemaining,
  userEmail,
  title,
  subtitle,
  children,
}: AppSurfaceProps & {
  title: string;
  /** One line under the title. Optional — not every page owes an explanation. */
  subtitle?: string;
  children: ReactNode;
}) {
  const t = useTranslations();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-white">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 min-[900px]:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}
      {/* block, not flex: the rail inside is `sticky`, and it needs a plain
          block container as tall as the page to stick within. */}
      <div>
        <HomeSidebar
          current={current}
          tier={tier}
          max={quotaMax}
          remaining={quotaRemaining}
          userEmail={userEmail}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      </div>

      {/* min-w-0 so this flex child can shrink below its content's intrinsic
          width instead of pushing the page past the viewport. */}
      <main className="min-w-0 flex-1 overflow-x-hidden px-6 py-8">
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              {/* Below 900px the rail is off-canvas, so this is the only way
                  back to the rest of the app. Without it these pages are a
                  dead end on a phone. */}
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="rounded-lg border border-[#ECECF2] p-1.5 min-[900px]:hidden"
                aria-label={t('app.openMenu')}
              >
                <Category set="light" size={16} primaryColor="#8A8896" />
              </button>
              <h1 className="truncate font-[family-name:var(--font-general-sans)] text-lg font-semibold text-[#17161F]">
                {title}
              </h1>
            </div>
            <LanguageInlineSwitch />
          </div>

          {subtitle && (
            <p className="-mt-4 mb-7 max-w-[62ch] text-[14px] leading-[1.6] text-[#6B6880]">
              {subtitle}
            </p>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
