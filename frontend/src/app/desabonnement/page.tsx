import type { Metadata } from 'next';
import Link from 'next/link';
import { documentMetadata } from '@/lib/seo';

// Where the unsubscribe link lands (2026-10-31). noindex: it is the end of
// an e-mail, not a page anyone should find in a search.
export const metadata: Metadata = documentMetadata(
  {
    path: '/desabonnement',
    title: 'Désabonnement · RenderPro',
    description: 'Vous ne recevrez plus d’e-mails de relance de RenderPro.',
    index: false,
    absoluteTitle: true,
  },
  'fr',
);

interface Props {
  searchParams: Promise<{ lang?: string }>;
}

export default async function UnsubscribePage({ searchParams }: Props) {
  const { lang } = await searchParams;
  const fr = lang !== 'en';

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#EEEEF1] px-6 text-center">
      <div className="flex max-w-md flex-col gap-3 rounded-[20px] bg-white px-8 py-10">
        <p className="font-[family-name:var(--font-display)] text-[18px] font-bold text-[#2948FC]">
          RenderPro
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[22px] font-black text-[#17161F]">
          {fr ? 'C’est fait' : 'Done'}
        </h1>
        <p className="text-[14px] leading-relaxed text-[#3D3B49]">
          {fr
            ? 'Vous ne recevrez plus d’e-mails de relance de notre part. Votre compte, vos images et vos crédits ne changent pas.'
            : 'You will not receive any more reminder emails from us. Your account, your images and your credits are unchanged.'}
        </p>
        <p className="text-[13px] leading-relaxed text-[#6B6878]">
          {fr
            ? 'Les e-mails dont vous avez besoin continuent d’arriver : codes de connexion et reçus de paiement.'
            : 'The emails you need still arrive: sign-in codes and payment receipts.'}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <Link
            href={fr ? '/?lang=fr' : '/?lang=en'}
            className="flex h-11 items-center justify-center rounded-xl bg-[#2948FC] text-[14px] font-semibold text-white hover:bg-[#1E36D6]"
          >
            {fr ? 'Retour au site' : 'Back to the site'}
          </Link>
          <p className="text-[12px] leading-relaxed text-[#8A8896]">
            {fr
              ? 'Vous vous êtes désabonné par erreur ? Écrivez-nous depuis l’application, bouton « Assistant ».'
              : 'Unsubscribed by mistake? Message us from the app, the “Assistant” button.'}
          </p>
        </div>
      </div>
    </main>
  );
}
