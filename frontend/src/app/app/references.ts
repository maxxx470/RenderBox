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
// THEY LAST THE VISIT, NOT FOREVER (2026-10-29, owner: « l'image de
// référence ne doit pas rester là toujours … quand le rendu est fini, si
// l'utilisateur veut te ramener l'image, il le fait »). They used to be kept
// in localStorage, so the same picture came back weeks later on a project
// that had nothing to do with it — « l'image de référence est toujours la
// même ». Now the list lives in memory only: you chain as many renders as you
// like within one visit, and leaving or reloading the page clears it.
import { useCallback, useState } from 'react';

/** Owner's choice: enough for a building, its planting and its sky. */
export const MAX_REFERENCES = 3;

export interface ReferenceImage {
  projectId: string;
  nodeId: string;
}

/**
 * The references pinned right now, and the two ways to change them.
 *
 * Nothing is stored: the list starts empty on every load, which is the whole
 * point — a reference belongs to the piece of work you are doing, not to the
 * browser. One `useReferences` per page, so the panel and the command bar
 * read the same list.
 */
export function useReferences(): {
  references: ReferenceImage[];
  addReference: (image: ReferenceImage) => void;
  removeReference: (nodeId: string) => void;
  isReference: (nodeId: string) => boolean;
  full: boolean;
} {
  const [references, setReferences] = useState<ReferenceImage[]>([]);

  // The updater must stay a pure function of the current list (React may
  // call it twice), so the "already there / already full" answer is the
  // caller's: the buttons are disabled in both cases.
  const addReference = useCallback((image: ReferenceImage) => {
    setReferences((current) => {
      if (current.some((r) => r.nodeId === image.nodeId)) return current;
      if (current.length >= MAX_REFERENCES) return current;
      return [...current, image];
    });
  }, []);

  const removeReference = useCallback((nodeId: string) => {
    setReferences((current) => {
      return current.filter((r) => r.nodeId !== nodeId);
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
