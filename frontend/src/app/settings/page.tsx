// /settings — superseded by /parametres (Phase 6). Kept as a redirect so
// any stale bookmark/link still lands somewhere useful.
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/parametres');
  }, [router]);
  return null;
}
