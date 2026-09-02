import localFont from 'next/font/local';

// General Sans (Indian Type Foundry, via Fontshare — free for commercial use,
// self-hosted here since it isn't on Google Fonts). Site-wide default body/
// heading font, loaded once in the root layout (frontend/src/app/layout.tsx)
// alongside JetBrains Mono — the pairing introduced on the landing redesign,
// now the single charter for every route.
export const generalSans = localFont({
  src: [
    { path: './GeneralSans-400.woff2', weight: '400', style: 'normal' },
    { path: './GeneralSans-500.woff2', weight: '500', style: 'normal' },
    { path: './GeneralSans-600.woff2', weight: '600', style: 'normal' },
    { path: './GeneralSans-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-general-sans',
  display: 'swap',
});
