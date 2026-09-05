'use client';

// The Paramètres content, inside the workspace frame.
//
// This page used to wear the landing's SiteHeader, so reaching it from the
// rail replaced the workspace with the marketing chrome — the rail gone, and
// the only way back a "Retour à l'app" button in the header. It is a page of
// the application, so it gets the application's frame like every other one.
//
// Account info, linked providers (moved from the Phase-1 /settings
// placeholder), billing history, and the default-engine picker (which
// replaces AppShell's Phase-4 localStorage preference).

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, useAuth } from '@/contexts/AuthContext';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { api } from '@/lib/api';
import { AppSurface, type AppSurfaceProps } from '@/app/app/AppSurface';
import { isPlaceholderAccount } from '@/lib/account-label';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { EngineSelect } from '@/app/app/EngineSelect';

interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export function ParametresClient({ surface }: { surface: AppSurfaceProps }) {
  const t = useTranslations();
  const user = useUser();
  const { logout, refresh } = useAuth();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [engineSaved, setEngineSaved] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const res = await api<{ items: OrderRow[] }>('/api/orders');
      setOrders(res.items);
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  async function handleEngineChange(next: EngineName) {
    setEngineSaved(false);
    try {
      await api('/api/users/me', {
        method: 'PATCH',
        body: { defaultEngine: next },
      });
      await refresh();
      setEngineSaved(true);
    } catch {
      // Non-fatal — the select just won't have persisted.
    }
  }

  // The client auth context is still resolving. The frame is painted
  // anyway — the rail's figures came from the server and are already known,
  // so the page arrives whole instead of as a blank screen with an ellipsis.
  if (!user) {
    return (
      <AppSurface {...surface} title={t('parametres.title')}>
        <p className="text-[13px] text-[#8A8896]">…</p>
      </AppSurface>
    );
  }

  const googleLinked = user.linkedProviders.includes('google');

  return (
    <AppSurface {...surface} title={t('parametres.title')}>
      <div className="flex max-w-lg flex-col gap-6">
        <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECECF2] p-5">
          <h2 className="text-[15px] font-semibold text-[#17161F]">
            {t('parametres.accountTitle')}
          </h2>
          {/* With AUTH_DISABLED on there is no account behind this section:
              every visitor shares one seeded row. Naming its address here, and
              offering to sign out of it, described a session nobody has. The
              section states the access mode instead, and the sign-out button
              — which would have logged the visitor out of nothing — is not
              rendered. See lib/account-label.ts. */}
          <p className="text-[13px] text-[#8A8896]">
            {isPlaceholderAccount(user.email)
              ? t('parametres.freeAccessBody')
              : t('parametres.connectedAs', { email: user.email })}
          </p>
          {!isPlaceholderAccount(user.email) && (
            <button
              type="button"
              onClick={() => void logout()}
              className="self-start rounded-[10px] border border-[#ECECF2] px-4 py-2 text-[13px] font-medium text-[#17161F] hover:bg-[#F7F7FA]"
            >
              {t('parametres.logoutButton')}
            </button>
          )}
        </section>

        {/* Hidden under free access for the same reason the sign-out button
            is: there is no account to link a Google identity TO. Every visitor
            resolves to one shared row, so the link would attach a stranger's
            Google identity to it — and then sign the next visitor in as them.
            The section returns the day AUTH_DISABLED comes off. */}
        {!isPlaceholderAccount(user.email) && (
          <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECECF2] p-5">
            <h2 className="text-[15px] font-semibold text-[#17161F]">
              {t('parametres.linkedAccountsTitle')}
            </h2>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-[#17161F]">Google</span>
                <span className="text-[12px] text-[#8A8896]">
                  {googleLinked ? t('parametres.googleLinked') : t('parametres.googleNotLinked')}
                </span>
              </div>
              {googleLinked ? (
                <span className="rounded-[20px] border border-[#1E7A3D33] bg-[#1E7A3D14] px-3 py-1 text-[12px] font-medium text-[#1E7A3D]">
                  {t('parametres.linkedBadge')}
                </span>
              ) : (
                <a
                  href="/api/auth/oauth/google/start?next=/parametres"
                  className="rounded-[10px] border border-[#ECECF2] px-4 py-2 text-[13px] font-medium text-[#17161F] hover:bg-[#F7F7FA]"
                >
                  {t('parametres.linkGoogleButton')}
                </a>
              )}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECECF2] p-5">
          <h2 className="text-[15px] font-semibold text-[#17161F]">
            {t('parametres.engineTitle')}
          </h2>
          <p className="text-[12px] text-[#8A8896]">{t('parametres.engineHint')}</p>
          {/* The same picker the command bar uses. This was a bare <select>,
              the only OS-rendered control on the page, sitting among custom
              chips everywhere else — and it showed none of the per-engine
              marks the command bar does. */}
          <div className="w-fit">
            <EngineSelect
              engine={
                user.defaultEngine === 'nanobanana' || user.defaultEngine === 'gpt_image'
                  ? user.defaultEngine
                  : 'nanobanana'
              }
              onChange={(next) => void handleEngineChange(next)}
              placement="down"
              align="start"
            />
          </div>
          {engineSaved ? (
            <p className="text-[12px] text-[#1E7A3D]">{t('parametres.engineSaved')}</p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECECF2] p-5">
          <h2 className="text-[15px] font-semibold text-[#17161F]">
            {t('parametres.billingTitle')}
          </h2>
          {orders && orders.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-[#8A8896]">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR')} · {o.status}
                  </span>
                  <span className="text-[#17161F]">
                    {o.amount.toLocaleString('fr-FR')} {o.currency}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-[#8A8896]">{t('parametres.billingEmpty')}</p>
          )}
          <Link
            href="/#tarifs"
            className="mt-2 inline-block self-start rounded-[10px] bg-gradient-to-br from-[#6E6BFF] via-[#8B5CF6] to-[#A855F7] px-4 py-2 text-[13px] font-medium text-white"
          >
            {t('parametres.buyButton')}
          </Link>
        </section>
      </div>
    </AppSurface>
  );
}
