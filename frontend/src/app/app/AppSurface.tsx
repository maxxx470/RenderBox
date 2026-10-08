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
// It is deliberately only the frame (AppFrame: header bar, rail, bottom bar).
// The page's own content comes in as children; its title goes to the header
// bar, as Metrio titles its pages.
import type { ReactNode } from 'react';
import { AppFrame } from './AppFrame';
import type { RailPage } from './HomeSidebar';
import { MOBILE_NAV_PAD } from './MobileNav';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { PageHeader } from './PageHeader';

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
  eyebrow,
  title,
  subtitle,
  headerAction,
  headTitle,
  headAlign,
  children,
}: AppSurfaceProps & {
  /** The small uppercase line above the title (PageHeader). */
  eyebrow: string;
  /** The page title — in the header bar and, in bold, at the top of the page. */
  title: string;
  /** One line under the title. */
  subtitle?: string;
  headerAction?: ReactNode;
  /** The heading in the page when it differs from the header bar's name
   *  (Metrio: "Abonnement" in the bar, "Rechargez votre compte" on the page). */
  headTitle?: string;
  headAlign?: 'left' | 'center';
  children: ReactNode;
}) {
  return (
    <AppFrame current={current} topbar={{ title, tier, quotaMax, quotaRemaining, userEmail }}>
      {/* min-w-0 so this flex child can shrink below its content's intrinsic
          width instead of pushing the page past the viewport. */}
      <main
        className={`min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#EEEEF1] px-4 py-6 min-[640px]:px-6 min-[640px]:py-8 ${MOBILE_NAV_PAD}`}
      >
        <div className="mx-auto max-w-[1100px]">
          <PageHeader
            eyebrow={eyebrow}
            title={headTitle ?? title}
            subtitle={subtitle}
            action={headerAction}
            align={headAlign ?? 'left'}
          />
          {children}
        </div>
      </main>
    </AppFrame>
  );
}
