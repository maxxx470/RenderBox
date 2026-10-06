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
// children. Below 900px the rail gives way to the bottom bar (MobileNav), as
// on every screen of the app.
import type { ReactNode } from 'react';
import { LanguageInlineSwitch } from '@/components/LanguageToggle';
import { HomeSidebar, type RailPage } from './HomeSidebar';
import { MOBILE_NAV_PAD, MobileNav } from './MobileNav';
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
  return (
    <div className="flex min-h-screen bg-white">
      {/* block, not flex: the rail inside is `sticky`, and it needs a plain
          block container as tall as the page to stick within. */}
      <div>
        <HomeSidebar
          current={current}
          tier={tier}
          max={quotaMax}
          remaining={quotaRemaining}
          userEmail={userEmail}
        />
      </div>

      {/* min-w-0 so this flex child can shrink below its content's intrinsic
          width instead of pushing the page past the viewport. */}
      <main
        className={`min-w-0 flex-1 overflow-x-hidden px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 ${MOBILE_NAV_PAD}`}
      >
        <div className="mx-auto max-w-[1100px]">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="truncate font-[family-name:var(--font-general-sans)] text-lg font-semibold text-[#17161F]">
                {title}
              </h1>
            </div>
            <LanguageInlineSwitch />
          </div>

          {subtitle && (
            <p className="-mt-4 mb-7 max-w-[62ch] text-[14px] leading-[1.6] text-[#5F6B64]">
              {subtitle}
            </p>
          )}

          {children}
        </div>
      </main>
      <MobileNav current={current} userEmail={userEmail} />
    </div>
  );
}
