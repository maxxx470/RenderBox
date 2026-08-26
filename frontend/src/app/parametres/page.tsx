// /parametres — Phase 6. Account info, linked providers (moved from the
// Phase-1 /settings placeholder), billing history, and the default-engine
// picker (replaces AppShell's Phase-4 localStorage preference).
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, useAuth } from '@/contexts/AuthContext';
import { useTranslations } from '@/lib/i18n/LocaleContext';
import { LanguageToggle } from '@/components/LanguageToggle';
import { api, ApiError } from '@/lib/api';
import type { EngineName } from '@/lib/server/generation/engines/types';
import { ENGINE_NAMES } from '@/lib/server/generation/engines/types';
import { ENGINE_LABELS } from '@/lib/server/generation/engine-labels';

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
  const [buyError, setBuyError] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);

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
        body: JSON.stringify({ defaultEngine: next }),
      });
      await refresh();
      setEngineSaved(true);
    } catch {
      // Non-fatal — the select just won't have persisted.
    }
  }

  async function handleBuy() {
    setBuying(true);
    setBuyError(null);
    try {
      const res = await api<{ paymentUrl: string }>('/api/payments/checkout', { method: 'POST' });
      window.location.href = res.paymentUrl;
    } catch (err) {
      setBuyError(
        err instanceof ApiError && err.status === 503
          ? t('app.uploadError')
          : t('parametres.buyError'),
      );
      setBuying(false);
    }
  }

  if (!user) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-4">
        <p className="text-sm text-[#7A6E71]">…</p>
      </main>
    );
  }

  const googleLinked = user.linkedProviders.includes('google');

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-8 px-4 py-12">
      <LanguageToggle />
      <header className="flex flex-col gap-1">
        <h1 className="font-[family-name:var(--font-poppins)] text-2xl font-bold text-[#170608]">
          {t('parametres.title')}
        </h1>
      </header>

      <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECE3E5] p-5">
        <h2 className="text-[15px] font-semibold text-[#170608]">{t('parametres.accountTitle')}</h2>
        <p className="text-[13px] text-[#7A6E71]">
          {t('parametres.connectedAs', { email: user.email })}
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="self-start rounded-[10px] border border-[#ECE3E5] px-4 py-2 text-[13px] font-medium text-[#170608] hover:bg-[#F8F5F6]"
        >
          {t('parametres.logoutButton')}
        </button>
      </section>

      <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECE3E5] p-5">
        <h2 className="text-[15px] font-semibold text-[#170608]">
          {t('parametres.linkedAccountsTitle')}
        </h2>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-[#170608]">Google</span>
            <span className="text-[12px] text-[#7A6E71]">
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
              className="rounded-[10px] border border-[#ECE3E5] px-4 py-2 text-[13px] font-medium text-[#170608] hover:bg-[#F8F5F6]"
            >
              {t('parametres.linkGoogleButton')}
            </a>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECE3E5] p-5">
        <h2 className="text-[15px] font-semibold text-[#170608]">{t('parametres.engineTitle')}</h2>
        <p className="text-[12px] text-[#7A6E71]">{t('parametres.engineHint')}</p>
        <select
          value={user.defaultEngine ?? 'nanobanana'}
          onChange={(e) => void handleEngineChange(e.target.value as EngineName)}
          className="w-fit rounded-[10px] border border-[#ECE3E5] bg-[#F8F5F6] px-3 py-2 text-[13px] text-[#170608] outline-none"
        >
          {ENGINE_NAMES.map((name) => (
            <option key={name} value={name}>
              {ENGINE_LABELS[name].name}
            </option>
          ))}
        </select>
        {engineSaved ? (
          <p className="text-[12px] text-[#1E7A3D]">{t('parametres.engineSaved')}</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-[14px] border border-[#ECE3E5] p-5">
        <h2 className="text-[15px] font-semibold text-[#170608]">{t('parametres.billingTitle')}</h2>
        {orders && orders.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between text-[13px]">
                <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
                  {new Date(o.createdAt).toLocaleDateString('fr-FR')} · {o.status}
                </span>
                <span className="text-[#170608]">
                  {o.amount.toLocaleString('fr-FR')} {o.currency}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-[#7A6E71]">{t('parametres.billingEmpty')}</p>
        )}
        <button
          type="button"
          disabled={buying}
          onClick={() => void handleBuy()}
          className="mt-2 self-start rounded-[10px] bg-gradient-to-br from-[#E8121F] to-[#7F0000] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {t('parametres.buyButton')}
        </button>
        {buyError ? <p className="text-[12px] text-[#B8710B]">{buyError}</p> : null}
      </section>

      <Link href="/app" className="text-center text-sm text-[#7A6E71] hover:text-[#170608]">
        {t('parametres.backToApp')}
      </Link>
    </main>
  );
}
