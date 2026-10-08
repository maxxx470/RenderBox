// Single source of truth for what the client offers to upload. The server
// still re-validates by magic bytes (lib/server/upload/sniff.ts); this is UX,
// not a security boundary. Lived in Dropzone.tsx until the project editor's
// drop zone was removed (owner, 2026-10-08: images come in through the
// command bar).
export const ACCEPTED_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
