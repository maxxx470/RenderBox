import { redirect } from 'next/navigation';

// The in-app gallery was removed on 2026-10-06 at the owner's request —
// Enhance took its place in the rail. The address stays as a redirect so old
// bookmarks land on the tool that replaced it instead of a 404.
export default function AppExempleRedirect() {
  redirect('/app/enhance');
}
