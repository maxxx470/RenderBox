import { redirect } from 'next/navigation';

// /app/projets — the Projets page until 2026-10-08, when Mes images took its
// place (owner). Kept as a redirect so old links and bookmarks still land.
export default function AppProjectsPage() {
  redirect('/app/images');
}
