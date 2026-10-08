import { ImagesGrid } from '../ImagesGrid';
import { loadImagesPage } from '../images-data';

// /app/images — Mes images: every image of the account, uploaded, generated
// or enhanced, filtered Tout / Importées / Générées / Enhance. It took the
// Projets page's place on 2026-10-08 (owner, after Krea's "Assets"):
// /app/projets now redirects here.
export default async function AppImagesPage() {
  const { images, dashboard, userEmail } = await loadImagesPage();
  return (
    <ImagesGrid
      variant="images"
      initialImages={images}
      dashboard={dashboard}
      userEmail={userEmail}
    />
  );
}
