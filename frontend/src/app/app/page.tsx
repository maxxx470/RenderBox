import { ImagesGrid } from './ImagesGrid';
import { loadImagesPage } from './images-data';

// /app — the dashboard, and the first screen after sign-in: the account
// figures, the "3 steps" film and the showcase, then the latest images
// (every one is in Mes images, /app/images).
//
// The generation space it used to share this route with now lives at
// /app/generer, reachable from the sidebar. The data is shared with Mes
// images — see images-data.ts.
export default async function AppDashboardPage() {
  const { images, dashboard, userEmail } = await loadImagesPage();
  return (
    <ImagesGrid
      variant="dashboard"
      initialImages={images}
      dashboard={dashboard}
      userEmail={userEmail}
    />
  );
}
