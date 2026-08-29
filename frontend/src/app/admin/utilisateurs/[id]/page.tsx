'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useTranslations } from '@/lib/i18n/LocaleContext';

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  deletedAt: string | null;
  createdAt: string;
}
interface ProjectRow {
  id: string;
  name: string;
  createdAt: string;
  generationsCount: number;
}
interface OrderRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}
interface DetailResponse {
  user: UserDetail;
  projects: ProjectRow[];
  orders: OrderRow[];
}

const ROLES = ['USER', 'ADMIN', 'SUPERADMIN'] as const;

export default function AdminUserDetailPage() {
  const t = useTranslations();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<DetailResponse>(`/api/admin/users/${params.id}`);
      setData(res);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await load();
    } catch {
      setActionError(t('admin.userDetail.actionError'));
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return <p className="text-sm text-[#7A6E71]">{t('admin.userDetail.notFound')}</p>;
  }
  if (!data) return null;

  const { user, projects, orders } = data;

  return (
    <div>
      <Link
        href="/admin/utilisateurs"
        className="text-[12.5px] text-[#7A6E71] hover:text-[#170608]"
      >
        {t('admin.userDetail.back')}
      </Link>

      <div className="mt-3 mb-6 flex items-center gap-3.5">
        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-[#E8121F] to-[#7F0000] opacity-85" />
        <div>
          <h1 className="font-[family-name:var(--font-poppins)] text-[18px] font-semibold text-[#170608]">
            {user.name || user.email}
          </h1>
          <p className="text-[12.5px] text-[#7A6E71]">
            {t('admin.userDetail.memberSince', {
              date: new Date(user.createdAt).toLocaleDateString('fr-FR'),
            })}
          </p>
        </div>
      </div>

      {user.deletedAt ? (
        <div className="mb-5 rounded-[14px] border border-[#B8710B33] bg-[#B8710B14] px-4 py-3 text-[13px] text-[#B8710B]">
          {t('admin.userDetail.deletedBanner', {
            date: new Date(user.deletedAt).toLocaleDateString('fr-FR'),
            days: '30',
          })}
        </div>
      ) : null}

      {actionError ? <p className="mb-4 text-sm text-[#B8710B]">{actionError}</p> : null}

      <div className="mb-8 grid grid-cols-1 gap-3.5 md:grid-cols-2">
        <section className="rounded-[14px] border border-[#ECE3E5] p-4.5">
          <h2 className="mb-3 text-[13px] font-semibold text-[#170608]">
            {t('admin.userDetail.projectsTitle')}
          </h2>
          {projects.length === 0 ? (
            <p className="text-[12.5px] text-[#7A6E71]">{t('admin.userDetail.noProjects')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-[13px]">
                  <span className="text-[#170608]">{p.name}</span>
                  <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
                    {p.generationsCount}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[14px] border border-[#ECE3E5] p-4.5">
          <h2 className="mb-3 text-[13px] font-semibold text-[#170608]">
            {t('admin.userDetail.ordersTitle')}
          </h2>
          {orders.length === 0 ? (
            <p className="text-[12.5px] text-[#7A6E71]">{t('admin.userDetail.noOrders')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between text-[13px]">
                  <span className="font-[family-name:var(--font-ibm-plex-mono)] text-[11px] text-[#7A6E71]">
                    {o.status}
                  </span>
                  <span className="text-[#170608]">
                    {o.amount.toLocaleString('fr-FR')} {o.currency}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-[14px] border border-[#ECE3E5] p-4.5">
        <h2 className="mb-3.5 text-[13px] font-semibold text-[#170608]">
          {t('admin.userDetail.actionsTitle')}
        </h2>

        <div className="mb-4 flex items-center gap-2.5">
          <label className="text-[12.5px] text-[#7A6E71]">
            {t('admin.userDetail.roleSelectLabel')}
          </label>
          <select
            value={user.role}
            disabled={busy}
            onChange={(e) =>
              void runAction(() =>
                api(`/api/admin/users/${user.id}/role`, {
                  method: 'PATCH',
                  body: { role: e.target.value },
                }),
              )
            }
            className="rounded-[10px] border border-[#ECE3E5] bg-[#F8F5F6] px-3 py-1.5 text-[13px] text-[#170608] outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {user.status === 'SUSPENDED' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(() =>
                  api(`/api/admin/users/${user.id}/status`, {
                    method: 'PATCH',
                    body: { status: 'ACTIVE' },
                  }),
                )
              }
              className="rounded-[10px] border border-[#ECE3E5] px-4 py-2 text-[13px] font-medium text-[#170608] hover:bg-[#F8F5F6] disabled:opacity-50"
            >
              {t('admin.userDetail.restoreButton')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !!user.deletedAt}
              onClick={() => {
                if (!confirm(t('admin.userDetail.confirmSuspend'))) return;
                void runAction(() =>
                  api(`/api/admin/users/${user.id}/status`, {
                    method: 'PATCH',
                    body: { status: 'SUSPENDED' },
                  }),
                );
              }}
              className="rounded-[10px] border border-[#ECE3E5] px-4 py-2 text-[13px] font-medium text-[#170608] hover:bg-[#F8F5F6] disabled:opacity-50"
            >
              {t('admin.userDetail.suspendButton')}
            </button>
          )}

          {user.deletedAt ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runAction(() => api(`/api/admin/users/${user.id}/restore`, { method: 'POST' }))
              }
              className="rounded-[10px] bg-[#1E7A3D14] px-4 py-2 text-[13px] font-medium text-[#1E7A3D] hover:bg-[#1E7A3D22] disabled:opacity-50"
            >
              {t('admin.userDetail.restoreDeletedButton')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirm(t('admin.userDetail.confirmDelete'))) return;
                void runAction(() => api(`/api/admin/users/${user.id}`, { method: 'DELETE' }));
              }}
              className="rounded-[10px] bg-[#C8112012] px-4 py-2 text-[13px] font-medium text-[#C81120] hover:bg-[#C8112022] disabled:opacity-50"
            >
              {t('admin.userDetail.deleteButton')}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
