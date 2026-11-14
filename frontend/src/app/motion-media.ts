// Where the motion films live (2026-10-12, owner: keep them off Vercel's
// bandwidth). They are served from the Cloudflare R2 bucket "renderbox-media"
// (Western Europe), whose egress is free: a visitor scrolling the landing pulls
// ~55 MB of film, which on Vercel's 100 GB/month would cap the site at about
// 1 800 full visits a month.
//
// Files: motion/<film>-<fr|en>.mp4 and .jpg (the poster) — the same names as
// the copies still in public/motion/, which are no longer requested. To add or
// replace a film, upload it to the bucket under that name (wrangler r2 object
// put renderbox-media/motion/<name> --remote, cache-control immutable: give a
// changed film a new name rather than overwriting it).
//
// The r2.dev address is Cloudflare's public development URL: rate-limited and
// not meant for heavy production traffic. Once the site has its own domain on
// Cloudflare, connect it to the bucket (e.g. media.<domain>) and change
// MEDIA_ORIGIN below; csp.ts reads it too.

export const MEDIA_ORIGIN = 'https://pub-fc6020f1c90e413d8b091df39371afc2.r2.dev';

/**
 * The presentation film (with sound) and its poster for this language.
 *
 * Dated since 2026-11-08, like the films below and for the same reason: the
 * bucket caches as immutable, so a changed film goes up under a NEW name or
 * nobody ever sees it.
 *
 * Edition 20261109b fixes the French voice. 20261109 picked it on pitch alone
 * and landed on a « Multilingual » voice; those are built on an English base
 * and keep that accent in French, which is exactly what the owner heard
 * (« la voix en français, c'est comme si c'était de l'anglais »). NATIVENESS
 * COMES FIRST, pitch second: fr-FR-Denise, dropped 20 Hz, measures 178 Hz
 * against the original's 180. Never pick a *Multilingual* voice for the
 * language it is not native to. Denise also speaks a little more slowly, so
 * the section's four lines were re-fitted to the shots already rendered
 * (SECT_AT in the workspace's bande-son.py) rather than re-rendering 1320
 * frames. English is untouched — en-US-Ava is native there.
 *
 * Edition 20261109 REGENERATED THE WHOLE NARRATION, both languages (owner,
 * 2026-11-09: « tu vas régénérer totalement les voix, du début jusqu'à la fin
 * … je ne veux pas qu'il y ait des coupures ou des voix bizarres qui
 * s'ajoutent »). The section could not simply be given a voice of its own: one
 * foreign voice inside a film narrated end to end by another is worse than no
 * voice. So every line is new, from one engine, and the film's own music is
 * kept under it.
 *
 * How, because none of it is obvious and the next edit depends on it:
 *  - The script was nowhere: it was READ BACK off the film (faster-whisper,
 *    locally, nothing sent anywhere) — 53 lines in French, 31 in English, each
 *    with the timing the edit gives it. texte-{fr,en}.json in the workspace.
 *  - The voice was CHOSEN BY MEASUREMENT, not by ear, because this assistant
 *    cannot hear: the original narration is female, median pitch 180 Hz in
 *    French and 193 in English, 3.4 words/s. Every candidate was synthesised on
 *    one of the film's own sentences and measured the same way; Vivienne
 *    (184 Hz) and Ava (195 Hz) won. Denise at 203 and Eloise at 286 did not.
 *  - Each line is put back ON ITS OWN CUE and must fit the room the edit leaves
 *    it, else it would run over the next shot and the whole film would drift.
 *    The engine pads every utterance with silence; trimming that padding is
 *    what took the worst case from « speak 60 % faster » to no change at all.
 *    A line that ENDS after the insertion point belongs to what follows and
 *    moves with it — « Un rendu flou ou trop simple » starts 0.27 s before the
 *    cut and was playing under the new section while its own shot was silent.
 *  - The MUSIC IS THE FILM'S OWN, recovered from under the old voice by source
 *    separation (demucs), not replaced. Checked, not assumed: in the recovered
 *    bed the voice's 180 Hz signature is gone and the level DROPS 6.3 dB under
 *    speech — the original ducking, still there, so the new voice sits in it
 *    with no further treatment. The bed is instrumental, so the new section is
 *    covered by another passage of the same track, crossfaded at both joins.
 *  - The new voice is levelled onto the old one, measured over speech only:
 *    +1.42 dB in French, +0.64 in English.
 * This assistant cannot listen, so the TONE of the new voice is the one thing
 * here that was never verified. Everything else above was measured.
 *
 * Edition 20261108c was that section rebuilt so it EXPLAINS, after the owner read
 * the first cut: « tu n'as même pas pris du temps pour expliquer comment ça
 * s'anime ». The first try flashed the whole page shrunk to a grey blur and a
 * result; this one is 18 s of readable close-ups cut from a dsf-3 capture —
 * the camera-move grid with the pointer picking « Visite », « ce qui peut
 * bouger » with « Feuillage » ticked and the page's own « le bâtiment reste
 * immobile » line, the command bar, then the still becoming the video. The
 * steps are written on screen because the section has NO narration: see below.
 *
 * Edition 20261108b added a SECTION on video animation, before the « Améliorer »
 * part (owner, 2026-11-08: the first attempt only announced the feature in the
 * closing sequence — « tu n'as rien fait »). Eight seconds: the section card,
 * a capture of the Vidéo page with an image loaded and the prompt typed, then
 * the starting image beside the animation it produced, the prompt above them.
 * The « Animez. » beat of edition 20261108 is still there at the end.
 *
 * How it was done, because it constrains the next edit. Both editions are cut
 * from the ORIGINAL master in ONE pass, so the picture is never re-encoded
 * twice; a third edit re-applies all of them from presentation-<lang>.mp4
 * rather than building on this file. The insert goes in at the white dip that
 * precedes the « Un rendu flou ? » card (91.667 s FR, 88.167 s EN) and the
 * section's own background IS the film's frame at that instant, so both joins
 * fall on the same picture and cannot be seen.
 *
 * The SOUND is the constraint to know about: the edit project is not on this
 * machine and the film's music bed is in none of the project's libraries (all
 * of them were compared — mel-feature matching, no candidate above 0.57, and
 * the mix is near-mono so the voice cannot be separated out either). The bed
 * can therefore NOT be continued across an insert. The section carries its own
 * music (the Commenter shorts' track, levelled to the film's own -21.5 dB RMS)
 * with a whoosh in and a swell out to cover the two changes. It also has no
 * VOICE, unlike every other section: VoiceStudio, the local engine the project's
 * shorts use, opens on « Installer l'environnement local » — several GB that are
 * the owner's call to download — and it would not be the film's narrator anyway. An insert that
 * must keep the music unbroken has to take its time from somewhere instead, as
 * edition 20261108 did with the logo card's silent hold.
 *
 * Edition 20261114 is NOT an edit of the film above: it is a new film (owner,
 * 2026-11-14: « je valide les deux vidéos que tu as générées pour la
 * présentation du site »), about 1 min 45, built from scratch in Remotion — a
 * sketch becoming a render, the actions, the animation —, its own voice and
 * music, so none of the constraints above (the lost music bed, the inserts)
 * apply to it any more. Uploaded as the approved masters, 1920×1080 H.264 with
 * sound, not re-encoded (≈ 115 MB, the previous edition was ≈ 97 MB). The
 * poster is the frame at 1.2 s, the first one where the opening line
 * (« Ce croquis : 2 minutes. » / « This sketch: 2 minutes. ») is complete.
 * The 20261109b files stay in the bucket, unused.
 */
export const PRESENTATION_EDITION = '20261114';

export function presentationFilm(locale: string): { src: string; poster: string } {
  const base = `${MEDIA_ORIGIN}/motion/presentation-${PRESENTATION_EDITION}-${locale}`;
  return { src: `${base}.mp4`, poster: `${base}.jpg` };
}

// The bucket's files are cached as immutable, so a remade film goes up under a
// new name: <film>-<FILMS_EDITION>-<lang>.mp4. Null = the first edition,
// <film>-<lang>.mp4. The six feature films (commenter, arbre, moteurs,
// ajouter, ameliorer, etapes) were remade on the current interface on
// 2026-10-17 (owner: « corrige le logo et juste l'interface du site »).
//
// Edition 20261114: all six remade in Remotion beside the new presentation
// film, plus a seventh, `animer` (the Vidéo page), so the landing and the Info
// page show the animation too. Shorter (10–13 s each; etapes 36 s, now
// « Générez, corrigez, animez », animer 27 s), each ending on the
// « RenderPro.app » card. They carry a music track, which MotionFilm never
// plays (it is muted) — uploaded as rendered, not re-encoded, 2560×1440.
// Posters: 1 s in, except commenter 8.5 s, arbre 6.5 s and moteurs 7.5 s,
// whose first second is a dark title card or a camera move.
export const FILMS_EDITION: string | null = '20261114';

// A film remade on its own after its edition keeps a later name here. The two
// dashboard tutorials were re-rendered the same day without the engine
// version (« Pixel IA 2 » became « Pixel IA » when the version choice went).
export const FILM_EDITIONS: Readonly<Record<string, string>> = {
  'tuto-generer': '20261017b',
  'tuto-ameliorer': '20261017b',
};

/**
 * The landing's « Animation vidéo » clips (2026-11-08) — the three 16:9 loops
 * that show a render in movement. They are NOT motion-design films: they are
 * product output, rendered in Flow from the owner's own images, and they carry
 * no text of their own (the title is HTML over the card, so it translates).
 *
 * On R2 like everything heavy, and for the same reason: three autoplaying
 * clips add roughly 7 MB to a landing visit that already pulls ~55 MB of film.
 * Served from Vercel they would cut the site's monthly visit budget by about
 * an eighth, for one section.
 *
 * Two files per clip because the brief asks for both and the saving is real:
 * VP9 in WebM where the browser takes it, H.264 in MP4 for Safari. The poster
 * is a WebP of the clip's FIRST frame, so the card does not jump when the loop
 * starts.
 *
 * Upload (the names are dated, since the bucket caches as immutable — a
 * remade clip gets a new date here rather than overwriting):
 *   wrangler r2 object put renderbox-media/landing/<name> --remote \
 *     --file <file> --cache-control "public, max-age=31536000, immutable"
 */
export const LANDING_VIDEO_EDITION = '20261108';

export function landingVideo(name: string): { webm: string; mp4: string; poster: string } {
  const base = `${MEDIA_ORIGIN}/landing/${name}-${LANDING_VIDEO_EDITION}`;
  return { webm: `${base}.webm`, mp4: `${base}.mp4`, poster: `${base}.webp` };
}

/** The film's video and poster URLs for this language. */
export function motionFilm(film: string, locale: string): { src: string; poster: string } {
  const own = FILM_EDITIONS[film] ?? FILMS_EDITION;
  const edition = own ? `-${own}` : '';
  const base = `${MEDIA_ORIGIN}/motion/${film}${edition}-${locale}`;
  return { src: `${base}.mp4`, poster: `${base}.jpg` };
}
