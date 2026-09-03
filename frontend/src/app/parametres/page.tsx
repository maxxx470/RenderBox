// /parametres — Phase 6. Account info, linked providers (moved from the
// Phase-1 /settings placeholder), billing history, and the default-engine
// picker (replaces AppShell's Phase-4 localStorage preference).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, useAuth } from '@/contexts/AuthContext';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { SiteHeader } from '@/components/SiteHeader';
import { api } from '@/lib/api';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { EngineSelect } from '@/app/app/EngineSelect';

interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export default function ParametresPage() {
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

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-[#8A8896]">…</p>
      </main>
    );
  }

  const googleLinked = user.linkedProviders.includes('google');

  return (
    <main className="min-h-screen">
      {/* No marketing links here: someone managing their account should not be
          pushed back into the sales pages. The CTA returns to the workspace,
          which this page previously offered no way back to. */}
      <SiteHeader cta={{ href: '/app', label: t('parametres.backToApp') }} />
      <div className="mx-auto flex max-w-lg flex-col gap-8 px-4 py-12">
        <header className="flex flex-col gap-1">
          <h1 className="font-[family-name:var(--font-general-sans)] text-2xl font-bold text-[#17161F]">
            {t('parametres.title')}
          </h1>
        </header>

        <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECECF2] p-5">
          <h2 className="text-[15px] font-semibold text-[#17161F]">
            {t('parametres.accountTitle')}
          </h2>
          <p className="text-[13px] text-[#8A8896]">
            {t('parametres.connectedAs', { email: user.email })}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="self-start rounded-[10px] border border-[#ECECF2] px-4 py-2 text-[13px] font-medium text-[#17161F] hover:bg-[#F7F7FA]"
          >
            {t('parametres.logoutButton')}
          </button>
        </section>

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
    </main>
  );
}
