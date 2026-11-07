// /app/video — turn a finished render into a clip (2026-11-07, owner's
// « Cahier de référence — AI VIDEO GENERATION »).
//
// Image to video only: the user picks one of their own renders and the
// engine animates it. There is no text-to-video field anywhere, deliberately
// — a prompt alone would invent a building, which is the opposite of what
// this module is for.
//
// Ownership is not checked here: the route refuses a node the caller does
// not own, so a forged link shows nothing and runs nothing — the same rule
// the Enhance page follows.
import { loadAppSurface } from '../surface-data';
import { loadShell } from '../shell-data';
import { loadRecentRenders } from '../recent-renders';
import { VideoClient } from './VideoClient';

export default async function AppVideoPage() {
  const [surface, { auth }] = await Promise.all([loadAppSurface('video'), loadShell()]);
  const recentRenders = await loadRecentRenders(auth.user.sub);
  return <VideoClient surface={surface} recentRenders={recentRenders} />;
}
