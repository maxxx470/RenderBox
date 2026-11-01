'use client';

// Starting a payment, from the three places that can start one: the landing's
// pricing band, /app/tarifs and the plans dialog (2026-11-01).
//
// It exists because MoneyFusion REQUIRES a phone number (`numeroSend`) and
// the account's is optional — the onboarding asks for it on its first screen
// but only the name, the profession and the country are required. So a real
// account can reach the pricing cards with no number at all, and without this
// it would click « Choisir » and get a flat « une erreur est survenue » for
// ever, with nothing telling it what to type.
//
// The server answers 400 PHONE_REQUIRED; this asks for the number, retries
// the same checkout with it, and the route saves it on the account — so the
// question is asked once in the account's life, never again.
//
// The three call sites had the same twelve lines copied three times; they now
// share these, and the number prompt is one component instead of three.
import { useCallback, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useLocale } from '@/lib/i18n/LocaleContext';
import type { PricingTierId } from '@/lib/pricing-tiers';

type Errors = Record<PricingTierId, string | null>;

const NO_ERRORS: Errors = { decouverte: null, standard: null, pro: null };

export interface Checkout {
  /** Send the customer to the hosted payment page, asking for a number first
   *  when the account has none. */
  start: (tier: PricingTierId) => Promise<void>;
  /** Which tier is mid-checkout, for the button's spinner. */
  busyTier: PricingTierId | null;
  errors: Errors;
  /** Render this: the number prompt, when one is needed. Otherwise null. */
  phonePrompt: React.ReactNode;
}

export function useCheckout(): Checkout {
  const { t } = useLocale();
  const [busyTier, setBusyTier] = useState<PricingTierId | null>(null);
  const [errors, setErrors] = useState<Errors>(NO_ERRORS);
  /** The tier waiting on a number. */
  const [asking, setAsking] = useState<PricingTierId | null>(null);

  const go = useCallback(
    async (tier: PricingTierId, phone?: string) => {
      setBusyTier(tier);
      setErrors((prev) => ({ ...prev, [tier]: null }));
      try {
        const res = await api<{ paymentUrl: string }>('/api/payments/checkout', {
          method: 'POST',
          body: phone ? { tier, phone } : { tier },
        });
        setAsking(null);
        window.location.href = res.paymentUrl;
      } catch (err) {
        // The one error the customer can actually fix themselves.
        if (err instanceof ApiError && err.code === 'PHONE_REQUIRED') {
          setAsking(tier);
          setBusyTier(null);
          return;
        }
        setErrors((prev) => ({ ...prev, [tier]: t('landing.pricingError') }));
        setBusyTier(null);
        throw err;
      }
    },
    [t],
  );

  const start = useCallback(
    async (tier: PricingTierId) => {
      await go(tier).catch(() => {
        /* already shown on the card */
      });
    },
    [go],
  );

  const phonePrompt = asking ? (
    <PhonePrompt
      busy={busyTier !== null}
      error={errors[asking]}
      onCancel={() => {
        setAsking(null);
        setBusyTier(null);
      }}
      onSubmit={(phone) => {
        void go(asking, phone).catch(() => {
          /* already shown in the prompt */
        });
      }}
    />
  ) : null;

  return { start, busyTier, errors, phonePrompt };
}

function PhonePrompt({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (phone: string) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [value, setValue] = useState('');
  // Eight digits is the shortest real subscriber number in the zone; the
  // server checks it again (normalisePhone) and is the authority.
  const digits = value.replace(/\D+/g, '').length;
  const ready = digits >= 8 && digits <= 15;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-phone-title"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-[#17161F]/45 backdrop-blur-[2px] min-[640px]:items-center min-[640px]:p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        className="rb-pop-up w-full max-w-[420px] rounded-t-[24px] bg-white p-5 min-[640px]:rounded-[24px] min-[640px]:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) onSubmit(value);
        }}
      >
        <h2
          id="checkout-phone-title"
          className="font-[family-name:var(--font-display)] text-[19px] font-black text-[#17161F]"
        >
          {t('checkout.phoneTitle')}
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#6B6878]">
          {t('checkout.phoneNote')}
        </p>
        <label
          htmlFor="checkout-phone"
          className="mt-4 block text-[11px] font-semibold uppercase tracking-wide text-[#8A8896]"
        >
          {t('checkout.phoneLabel')}
        </label>
        <input
          id="checkout-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('checkout.phonePlaceholder')}
          className="mt-1.5 h-11 w-full rounded-xl border border-[#ECECF2] bg-white px-3.5 text-[14px] text-[#17161F] outline-none placeholder:text-[#8A8896] focus:border-[#2948FC]"
        />
        {error ? <p className="mt-2 text-[12.5px] text-[#C21F33]">{error}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-10 rounded-xl px-4 text-[13.5px] font-medium text-[#3D3B49] transition-colors hover:bg-[#F2F2F5] disabled:opacity-50"
          >
            {t('checkout.phoneCancel')}
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            className="h-10 rounded-xl bg-[#2948FC] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#1E36D6] disabled:opacity-50"
          >
            {busy ? t('checkout.phoneSending') : t('checkout.phoneSubmit')}
          </button>
        </div>
      </form>
    </div>
  );
}
