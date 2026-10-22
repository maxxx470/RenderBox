// The web app manifest (2026-10-20, owner: « intégrer la fonction PWA pour
// tout type d'appareil et système d'exploitation »). It makes RenderPro
// installable from Chrome, Edge, Samsung Internet, Firefox for Android and
// Opera (Android, Windows, macOS, Linux, ChromeOS) and from Safari's « Sur
// l'écran d'accueil » / « Ajouter au Dock » (iOS, iPadOS, macOS — those also
// read the apple-touch-icon of app/apple-icon.png and the appleWebApp
// metadata of the root layout). Served at /manifest.webmanifest.
//
// The app opens on /app (the proxy sends an anonymous visitor to /connexion),
// in its own window. Icons: the owner's mark on white, generated from
// public/brand/mark-1024.png — « any » for the launcher, « maskable » with the
// mark inside the 80% safe zone so Android's round and squircle masks do not
// cut it.
import type { MetadataRoute } from 'next';

const SHORTCUT_ICON = [{ src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' }];

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'RenderPro',
    short_name: 'RenderPro',
    description:
      'Rendus d’architecture par IA : de l’esquisse ou de la photo au rendu. / AI architectural renders from a sketch or a photo.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#EEEEF1',
    theme_color: '#FFFFFF',
    categories: ['design', 'productivity', 'graphics'],
    icons: [
      { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      {
        name: 'Générateur d’images',
        short_name: 'Générer',
        url: '/app/generer',
        icons: SHORTCUT_ICON,
      },
      {
        name: 'Améliorer une image',
        short_name: 'Améliorer',
        url: '/app/enhance',
        icons: SHORTCUT_ICON,
      },
      { name: 'Galerie', short_name: 'Galerie', url: '/app/images', icons: SHORTCUT_ICON },
    ],
  };
}
