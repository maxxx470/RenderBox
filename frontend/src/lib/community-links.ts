// RenderPro's public channels (owner, 2026-10-15), shown on the in-app Info
// page. One WhatsApp channel per language — the interface's language picks
// it; the site always has one (FR or EN, English when the country is
// unknown) — and one YouTube channel for both: « AI for Architects »
// (2026-10-15, the owner's umbrella channel for RenderPro and the tools to
// come; ChronoBuild before, its old Shorts set to private).
import type { Locale } from './i18n/dictionaries';

export const WHATSAPP_CHANNEL: Record<Locale, string> = {
  fr: 'https://whatsapp.com/channel/0029Vb8iD5nBadmWlQ2iRZ2R',
  en: 'https://whatsapp.com/channel/0029VbDLEcL7IUYPymSt4C3t',
};

export const YOUTUBE_CHANNEL = 'https://www.youtube.com/@ai4architectstv';

// The owner's TikTok account (2026-10-17: « comme avec la chaîne YouTube »),
// on the Info page and in the public footer.
export const TIKTOK_ACCOUNT = 'https://www.tiktok.com/@ma.sado';
