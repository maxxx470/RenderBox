'use client';

// The payment, on our own page (owner, 2026-11-02: « il a parlé d'une
// seconde intégration où l'utilisateur n'est pas redirigé … je préfère cette
// version-là, donc il fait tout sur le site »).
//
// `POST /api/payments/checkout` asks Moneriz for an `iframe` session and
// returns its `embedUrl`; this mounts that address in an iframe over the
// page, so the customer picks their operator, pays, and sees the result
// without ever leaving RenderPro. The three places that sell a plan — the
// landing, /app/tarifs and the plans dialog — all go through
// `useMonerizCheckout` so there is one implementation of the payment
// surface, not three.
//
// **The browser is never believed.** Moneriz's own documentation says so:
// the iframe posts a `moneriz.payment` message, and that message is only a
// cue to go and ASK OUR SERVER, which re-asks Moneriz's API
// (`GET /api/payments/verify` → `reconcileMonerizOrder`). A forged
// postMessage therefore buys nothing: it can at most make us verify an
// order that is not paid, which answers PENDING. Credits move on the signed
// webhook and on that server-side verification, nowhere else.
//
// What the message IS checked for, before even being read: it came from
// this iframe's own window, from the exact origin of the embedUrl, and it
// carries the session's `embedToken`. Legacy `izipaye.*` events are ignored.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CloseSquare, Danger, TickSquare } from 'react-iconly';
import { BrandMark, Wordmark } from '@/components/BrandMark';
import { api } from '@/lib/api';
import type { PricingTierId } from '@/lib/pricing-tiers';
import { useLocale } from '@/lib/i18n/LocaleContext';

/** What the checkout route answers. */
interface CheckoutSession {
  orderId: string;
  sessionId: string;
  embedUrl: string | null;
  embedToken: string | null;
  /** The hosted page — the fallback when the frame cannot be used. */
  paymentUrl: string | null;
}

type Phase = 'paying' | 'verifying' | 'paid' | 'failed';

/** Moneriz asks for every resize to be applied, decreases included, and for
 *  no max-height. These are its own documented bounds. */
const MIN_FRAME_H = 320;
const MAX_FRAME_H = 4000;

/** How long to keep asking our server after the frame says « paid ». The
 *  signed webhook usually lands first; this covers the case where it is
 *  slower than the customer's own browser. */
const VERIFY_ATTEMPTS = 10;
const VERIFY_DELAY_MS = 2000;

export function useMonerizCheckout() {
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [startingTier, setStartingTier] = useState<PricingTierId | null>(null);

  const start = useCallback(async (tier: PricingTierId): Promise<boolean> => {
    setStartingTier(tier);
    try {
      const res = await api<CheckoutSession>('/api/payments/checkout', {
        method: 'POST',
        body: { tier },
      });
      // No frame to mount (Moneriz fell back to its hosted page because the
      // origin is not allow-listed yet): take the customer there rather than
      // showing them an empty dialog.
      if (!res.embedUrl) {
        if (!res.paymentUrl) return false;
        window.location.href = res.paymentUrl;
        return true;
      }
      setSession(res);
      return true;
    } catch {
      return false;
    } finally {
      setStartingTier(null);
    }
  }, []);

  const close = useCallback(() => setSession(null), []);

  return { session, startingTier, start, close };
}

export function MonerizCheckoutFrame({
  session,
  onClose,
}: {
  session: CheckoutSession;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(560);
  const [phase, setPhase] = useState<Phase>('paying');
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  // A ref as well as state: the message handler must not be re-installed on
  // every phase change, or a message can arrive while no listener is bound.
  const phaseRef = useRef<Phase>('paying');
  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const embedUrl = session.embedUrl ?? '';
  const expectedOrigin = (() => {
    try {
      return new URL(embedUrl).origin;
    } catch {
      return null;
    }
  })();

  /** Asks OUR server what the order is worth. The only thing that counts. */
  const verify = useCallback(async () => {
    setPhaseBoth('verifying');
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
      try {
        const res = await api<{ status: string }>(
          `/api/payments/verify?orderId=${encodeURIComponent(session.orderId)}`,
        );
        if (res.status === 'PAID') {
          setPhaseBoth('paid');
          return;
        }
        if (res.status === 'FAILED' || res.status === 'EXPIRED') {
          setPhaseBoth('failed');
          return;
        }
      } catch {
        // A network blip is not a failed payment — keep asking.
      }
      await new Promise((r) => setTimeout(r, VERIFY_DELAY_MS));
    }
    // Still not settled. Never announce a failure we have not observed: the
    // webhook keeps working and the plan opens on its own.
    setPhaseBoth('verifying');
  }, [session.orderId, setPhaseBoth]);

  useEffect(() => {
    if (!expectedOrigin) return;

    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.origin !== expectedOrigin) return;

      const m: unknown = event.data;
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      const msg = m as Record<string, unknown>;
      // `izipaye.*` is Moneriz's own legacy alias — its docs say to ignore it.
      if (msg.source !== 'moneriz' || msg.version !== 1) return;
      // The token is the `{token}` of /integrer/{token}, which the server
      // read off the embedUrl. It is required, not optional: without it we
      // could not tell this frame's messages from any other frame's, and
      // treating a missing token as « nothing to check » would turn the
      // guard off exactly when it stopped working.
      if (!session.embedToken || msg.token !== session.embedToken) return;

      switch (msg.type) {
        case 'moneriz.resize': {
          const h = msg.height;
          if (typeof h === 'number' && Number.isFinite(h)) {
            setHeight(Math.min(MAX_FRAME_H, Math.max(MIN_FRAME_H, Math.round(h))));
          }
          break;
        }
        case 'moneriz.resume': {
          // 3-D Secure refused to run inside the frame. Moneriz offers to
          // finish on its own page; this is the only moment we send the
          // customer off-site, and only in a new tab.
          if (typeof msg.resumeUrl === 'string' && msg.resumeUrl) setResumeUrl(msg.resumeUrl);
          break;
        }
        case 'moneriz.payment': {
          const status = msg.status;
          const confirmation = msg.confirmation;
          if (status === 'paid' && confirmation === 'confirmed') {
            if (phaseRef.current === 'paying') void verify();
          } else if (status === 'failed' || status === 'expired' || status === 'reversed') {
            setPhaseBoth('failed');
          }
          // `pending`, and `paid` not yet `confirmed`, deliberately change
          // nothing: the frame keeps its operator prompt or its QR code on
          // screen, which is what Moneriz asks for.
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [expectedOrigin, session.embedToken, verify, setPhaseBoth]);

  /** Moneriz expects `moneriz.init` once our listener is installed. */
  const onFrameLoad = useCallback(() => {
    const frame = frameRef.current;
    if (!frame?.contentWindow || !expectedOrigin) return;
    frame.contentWindow.postMessage(
      { source: 'moneriz', version: 1, type: 'moneriz.init' },
      expectedOrigin,
    );
  }, [expectedOrigin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape must not throw away a payment in flight.
      if (e.key === 'Escape' && (phase === 'paying' || phase === 'failed')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const done = () => {
    // Reload rather than patch state: the credits pill, the plan card and
    // Abonnement all read the account server-side.
    window.location.reload();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="moneriz-title"
      className="fixed inset-0 z-[80] flex flex-col bg-white"
    >
      {/* Full page on RenderPro, under our own logo (owner, 2026-11-03:
          « est-ce que tu peux faire en sorte que ça remplisse toute la page
          sur notre SaaS »). The payment form itself keeps a readable column
          — a card field stretched across a 1900px screen is not a payment
          page — but everything around it is ours. The logo and colours
          INSIDE the frame are Moneriz's own theme, set in its dashboard
          under Paramètres; nothing here can change them. */}
      <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-[#ECECF2] px-5 py-3.5">
        <span className="flex min-w-0 items-center gap-2.5">
          <BrandMark size="sm" />
          <span className="hidden sm:inline">
            <Wordmark />
          </span>
          <span
            aria-hidden
            className="hidden h-5 w-px flex-shrink-0 bg-[#ECECF2] sm:inline-block"
          />
          <h2
            id="moneriz-title"
            className="truncate font-[family-name:var(--font-display)] text-[17px] font-extrabold text-[#17161F]"
          >
            {phase === 'paid' ? t('paiement.successTitle') : t('paiement.title')}
          </h2>
        </span>
        {(phase === 'paying' || phase === 'failed') && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('paiement.close')}
            className="flex-shrink-0 rounded-lg p-1 text-[#6B6878] transition-colors hover:bg-[#F2F2F5] hover:text-[#17161F]"
          >
            <CloseSquare set="curved" size={22} primaryColor="currentColor" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[560px] px-4 py-6">
          {phase === 'paid' ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EEF1FF]">
                <TickSquare set="curved" size={30} primaryColor="#1E36D6" />
              </span>
              <p className="text-[15px] leading-relaxed text-[#3D3B49]">
                {t('paiement.successBody')}
              </p>
              <button
                type="button"
                onClick={done}
                className="rounded-xl bg-gradient-to-br from-[#435CFE] via-[#2948FC] to-[#1E36D6] px-5 py-3 text-[14px] font-semibold text-white transition-transform active:scale-[0.98]"
              >
                {t('paiement.successCta')}
              </button>
            </div>
          ) : phase === 'failed' ? (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE4E7]">
                <Danger set="curved" size={30} primaryColor="#C21F33" />
              </span>
              <p className="text-[15px] leading-relaxed text-[#3D3B49]">
                {t('paiement.failedBody')}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-[#F2F2F5] px-5 py-3 text-[14px] font-semibold text-[#17161F] transition-colors hover:bg-[#E9E9EE]"
              >
                {t('paiement.failedCta')}
              </button>
            </div>
          ) : (
            <>
              {phase === 'verifying' && (
                <p className="mb-4 rounded-xl bg-[#EEF1FF] px-4 py-3 text-[13px] leading-relaxed text-[#1E36D6]">
                  {t('paiement.verifying')}
                </p>
              )}
              {resumeUrl && (
                <p className="mb-4 rounded-xl bg-[#F7F7FA] px-4 py-3 text-[13px] leading-relaxed text-[#3D3B49]">
                  {t('paiement.resumeBody')}{' '}
                  <a
                    href={resumeUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-semibold text-[#2948FC] underline"
                  >
                    {t('paiement.resumeLink')}
                  </a>
                </p>
              )}
              {/* No max-height and no CSS zoom: Moneriz drives the height
                  through moneriz.resize and both break its layout. */}
              {/* The sandbox is what keeps the customer on RenderPro. Without
                  it (until 2026-11-03) Moneriz's page navigated OUR window to
                  the successUrl the moment the payment succeeded, throwing the
                  customer out of the dialog onto /paiement/retour. Its guide
                  says the sandbox « ne donne pas le droit de naviguer la page
                  parente » — we had simply not set one. Every token here is
                  needed and no more: `allow-top-navigation` is the one
                  deliberately absent, and `allow-same-origin` grants the frame
                  its OWN origin (moneriz.com), never ours. */}
              <iframe
                ref={frameRef}
                src={embedUrl}
                onLoad={onFrameLoad}
                title={t('paiement.title')}
                allow="payment"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                className="block w-full border-0"
                style={{ height }}
              />
              <p className="pt-4 text-center text-[12px] text-[#8A8896]">
                {t('paiement.secureNote')}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
