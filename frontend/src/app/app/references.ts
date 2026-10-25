'use client';

// The reference images of the generator (2026-10-25, owner: « à la place de
// la fiche de matériel … des images de référence. Comme ça ça permettra de
// garder une consistance entre plusieurs images »).
//
// WHY THEY REPLACED THE MATERIALS SHEET. The sheet described a render's
// materials in words, and the user copied that text under the prompt of the
// next render. It asked the engine to read a description of a picture when it
// could simply be shown the picture. The owner: « au lieu de créer une fiche
// de matériel qui ne marche peut-être pas et pour éviter de copier des trucs
// qui ne marchent pas aussi, je préfère mettre des images de référence ».
//
// A reference is one of the account's own images, named by its node id — a
// render made on the site (« Utiliser comme référence », under a finished
// render) or a picture uploaded from the computer through the same route as
// a source photo. Both end up as an image the account owns, which is what
// lets the server check it before sending it to an engine.
//
// They STAY until they are removed (owner's choice): you pin a reference
// once, then chain as many sketches as you like through it.
import { useCallback, useEffect, useState } from 'react';

/** Owner's choice: enough for a building, its planting and its sky. */
export const MAX_REFERENCES = 3;

export interface ReferenceImage {
  projectId: string;
  nodeId: string;
}

// Per-viewer convenience only: which images are pinned as references in THIS
// browser. The renders themselves live on the server; losing this list costs
// a couple of clicks, so a private window or cleared site data is fine.
const STORAGE_KEY = 'rp-references';

function read(): ReferenceImage[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is ReferenceImage =>
          typeof r === 'object' &&
          r !== null &&
          typeof (r as ReferenceImage).nodeId === 'string' &&
          typeof (r as ReferenceImage).projectId === 'string',
      )
      .slice(0, MAX_REFERENCES);
  } catch {
    return [];
  }
}

function write(list: ReferenceImage[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // A full or blocked store must not break the page: the list simply does
    // not survive the reload.
  }
}

/**
 * The references pinned in this browser, and the two ways to change them.
 *
 * Starts empty on the server and on the first paint, then fills in from the
 * store — reading it during render would make the server's HTML and the
 * browser's first HTML differ.
 */
export function useReferences(): {
  references: ReferenceImage[];
  addReference: (image: ReferenceImage) => void;
  removeReference: (nodeId: string) => void;
  isReference: (nodeId: string) => boolean;
  full: boolean;
} {
  const [references, setReferences] = useState<ReferenceImage[]>([]);

  useEffect(() => {
    setReferences(read());
  }, []);

  // The updater must stay a pure function of the current list (React may
  // call it twice), so the "already there / already full" answer is the
  // caller's: the buttons are disabled in both cases.
  const addReference = useCallback((image: ReferenceImage) => {
    setReferences((current) => {
      if (current.some((r) => r.nodeId === image.nodeId)) return current;
      if (current.length >= MAX_REFERENCES) return current;
      const next = [...current, image];
      write(next);
      return next;
    });
  }, []);

  const removeReference = useCallback((nodeId: string) => {
    setReferences((current) => {
      const next = current.filter((r) => r.nodeId !== nodeId);
      write(next);
      return next;
    });
  }, []);

  const isReference = useCallback(
    (nodeId: string) => references.some((r) => r.nodeId === nodeId),
    [references],
  );

  return {
    references,
    addReference,
    removeReference,
    isReference,
    full: references.length >= MAX_REFERENCES,
  };
}
