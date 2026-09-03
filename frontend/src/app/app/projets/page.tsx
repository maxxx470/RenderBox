import { redirect } from 'next/navigation';

// The dashboard moved to /app on 2026-09-03 — it is the first screen after
// sign-in, so it took the root. This redirect stays because /app/projets was
// the grid's address for a while and is sitting in browser histories and
// bookmarks; deleting it outright would turn those into 404s.
export default function AppProjectsRedirect() {
  redirect('/app');
}
