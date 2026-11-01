'use client';

// « Indexation » (2026-11-01, owner: « fais l'indexation sur bing et microsoft
// si possible … tout ce qu'il faut pour que l'indexation soit bonne »).
//
// Bing Webmaster Tools needs a Microsoft sign-in, so it cannot be driven from
// the code. IndexNow can: a key file on the site proves ownership and one call
// hands over every published address — Bing, Yandex, Seznam and Naver share
// the protocol. Google is not part of it and is reached by the sitemap.
//
// The button exists so a new page can be announced without waiting for a
// crawl: it is a hint to come sooner, never a promise of being indexed.
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import { useToast } from '@/contexts/ToastContext';

interface Preview {
  count: number;
  keyLocation: string;
}

interface Submitted {
  submitted: number;
  status: number;
  ok: boolean;
}

export function IndexNowCard() {
  const { t } = useLocale();
  const { toast } = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<Preview>('/api/admin/indexnow')
      .then(setPreview)
      .catch(() => setPreview(null));
  }, []);

  const submit = useCallback(async () => {
    setSending(true);
    try {
      const res = await api<Submitted>('/api/admin/indexnow', { method: 'POST' });
      if (res.ok) {
        toast(t('admin.seo.submitted', { n: String(res.submitted) }), 'success');
      } else {
        toast(t('admin.seo.refused', { status: String(res.status) }), 'error');
      }
    } catch {
      toast(t('admin.seo.failed'), 'error');
    } finally {
      setSending(false);
    }
  }, [t, toast]);

  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-white p-4 min-[640px]:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A8896]">
            {t('admin.seo.title')}
          </p>
          <p className="max-w-[62ch] text-[13px] leading-relaxed text-[#6B6878]">
            {t('admin.seo.what')}
          </p>
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={sending || preview === null}
          className="h-10 shrink-0 rounded-xl bg-[#2948FC] px-4 text-[13.5px] font-semibold text-white hover:bg-[#1E36D6] disabled:opacity-50"
        >
          {sending
            ? t('admin.seo.sending')
            : t('admin.seo.submit', { n: String(preview?.count ?? 0) })}
        </button>
      </div>
      <p className="text-[12px] text-[#8A8896]">{t('admin.seo.google')}</p>
    </section>
  );
}
