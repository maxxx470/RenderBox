'use client';

// Shown by the service worker (public/sw.js) in place of a page when the
// network cannot be reached. Both languages at once: the worker caches this
// page once, whatever the visitor's language is at that moment.
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-[#EEEEF1] px-6 text-center">
      <img src="/pwa/icon-192.png" alt="" width={72} height={72} className="rounded-2xl" />
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-[family-name:var(--font-display)] text-[22px] font-black text-[#17161F]">
          Vous êtes hors connexion
        </h1>
        <p className="text-[14px] leading-relaxed text-[#6B6878]">
          RenderPro a besoin d’Internet pour créer et afficher vos rendus. Vos images et vos crédits
          n’ont pas bougé : réessayez dès que la connexion revient.
        </p>
        <p className="text-[13px] leading-relaxed text-[#8A8896]">
          You are offline. RenderPro needs the internet to make and show your renders. Your images
          and credits are safe: try again once you are back online.
        </p>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="h-11 rounded-xl bg-[#2948FC] px-6 text-[14px] font-semibold text-white hover:bg-[#1E36D6]"
      >
        Réessayer · Try again
      </button>
    </main>
  );
}
