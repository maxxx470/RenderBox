// Images are made light enough to reach the server (2026-10-17). Vercel
// refuses any request body over 4.5 MB before a route even runs (413), so a
// phone photo or a downloaded render failed to upload whatever
// UPLOAD_MAX_BYTES allows — the « création rapide a échoué » the owner saw.
// A file over its budget is redrawn as a JPEG, its long edge capped, its
// quality then its size lowered until it fits; a file within it is sent as is.

/** What one file may weigh, and its longest side, by role. */
export const UPLOAD_FIT = {
  /** The photo a render starts from: 4096 px keeps a 4K render sharp. */
  source: { maxBytes: 3_500_000, maxEdge: 4096 },
  /** A reference or the marked copy: several may share one request. */
  reference: { maxBytes: 500_000, maxEdge: 1600 },
} as const;

const SENDABLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function fitForUpload(
  file: File,
  fit: { maxBytes: number; maxEdge: number } = UPLOAD_FIT.source,
): Promise<File> {
  if (file.size <= fit.maxBytes && SENDABLE.has(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Not decodable here (HEIC outside Safari): the server converts it.
    return file;
  }

  let scale = Math.min(1, fit.maxEdge / Math.max(bitmap.width, bitmap.height));
  let best: Blob | null = null;
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return file;
      // A transparent PNG would turn black as a JPEG.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.9, 0.82, 0.74]) {
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, 'image/jpeg', quality),
        );
        if (!blob) continue;
        best = blob;
        if (blob.size <= fit.maxBytes) {
          return new File([blob], jpegName(file.name), { type: 'image/jpeg' });
        }
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
  return best ? new File([best], jpegName(file.name), { type: 'image/jpeg' }) : file;
}

function jpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.jpg`;
}
