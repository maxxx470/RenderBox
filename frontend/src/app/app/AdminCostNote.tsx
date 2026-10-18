'use client';

// The real cost of the next click, for admins only (2026-10-18, owner): the
// Kie credits, dollars and FCFA the chosen engine charges at the chosen size
// (provider-cost.ts), beside the send button. Customers never see it — they
// pay the RenderPro credits written on the button.
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { realImageCost } from '@/lib/provider-cost';
import type { EngineName } from '@/lib/server/generation/engines/types';
import type { ResolutionKey } from '@/lib/server/generation/resolutions';

export function AdminCostNote({
  engine,
  resolution,
  count = 1,
}: {
  engine: EngineName;
  resolution: ResolutionKey;
  /** Images the click makes (an edit's variants). */
  count?: number;
}) {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  if (user?.role !== 'ADMIN' && user?.role !== 'SUPERADMIN') return null;

  const cost = realImageCost(engine, resolution, count);
  const tag = locale === 'fr' ? 'fr-FR' : 'en-US';
  const text = t('app.adminRealCost', {
    credits: cost.kieCredits.toLocaleString(tag),
    usd: cost.usd.toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    xof: cost.xof.toLocaleString(tag),
  });
  return (
    <span
      title={t('app.adminRealCostHint')}
      className="hidden flex-shrink-0 items-center rounded-md bg-[#EEF1FF] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] font-medium text-[#1E36D6] min-[1200px]:inline-flex"
    >
      {text}
    </span>
  );
}
