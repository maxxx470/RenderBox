// Small helper for the one client call that can't go through the shared
// `api()` wrapper (frontend/src/lib/api.ts, PROTECTED — JSON-only, always
// stringifies `body`): the multipart file upload. Mirrors api.ts's own CSRF
// cookie lookup so the upload request still carries `x-csrf-token`.
import { COOKIE_PREFIX } from '@/lib/constants';

const CSRF_COOKIE_NAME = `${COOKIE_PREFIX}-csrf`;

export function getCsrfTokenForUpload(): string | null {
  if (typeof window === 'undefined') return null;
  const fromStorage = localStorage.getItem(CSRF_COOKIE_NAME);
  if (fromStorage) return fromStorage;
  const escaped = CSRF_COOKIE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match && match[1] ? decodeURIComponent(match[1]) : null;
}
