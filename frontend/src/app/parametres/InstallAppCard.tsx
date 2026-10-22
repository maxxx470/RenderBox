'use client';

// « Installer RenderPro » — the Paramètres card of the PWA (2026-10-20, owner:
// the function for every device and system). One button where the browser
// offers the install itself (Chrome, Edge, Samsung Internet, Firefox for
// Android…), the Share-menu steps on iPhone and iPad, the File-menu step in
// Safari on a Mac, and a plain line anywhere else. Nothing is shown as
// installable once the app is already running installed.
import { useLocale } from '@/lib/i18n/LocaleContext';
import { usePwaInstall } from '@/lib/pwa-install';

const CARD = 'flex min-w-0 flex-col gap-3 rounded-[18px] bg-white p-5 min-[640px]:p-6';

export function InstallAppCard({ idPrefix }: { idPrefix: string }) {
  const { t } = useLocale();
  const { ready, standalone, canPrompt, platform, install } = usePwaInstall();
  if (!ready) return null;

  const body = standalone
    ? t('parametres.installDone')
    : canPrompt
      ? t('parametres.installBody')
      : platform === 'ios'
        ? t('parametres.installIos')
        : platform === 'mac-safari'
          ? t('parametres.installMacSafari')
          : t('parametres.installOther');

  return (
    <section className={CARD} aria-labelledby={`${idPrefix}-install`}>
      <h2
        id={`${idPrefix}-install`}
        className="font-[family-name:var(--font-display)] text-[15px] font-semibold text-[#17161F]"
      >
        {t('parametres.installTitle')}
      </h2>
      <p className="text-[13px] leading-relaxed text-[#6B6878]">{body}</p>
      {canPrompt && !standalone && (
        <button
          type="button"
          onClick={() => void install()}
          className="h-10 self-start rounded-xl bg-[#2948FC] px-5 text-[13.5px] font-semibold text-white hover:bg-[#1E36D6]"
        >
          {t('parametres.installButton')}
        </button>
      )}
    </section>
  );
}
