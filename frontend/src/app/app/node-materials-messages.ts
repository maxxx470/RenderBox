// What the per-image materials panel says when an action did not go through
// (étape 3C.4-S). A failure the client could classify (materialsErrorKind)
// keeps its own message whatever the action; an unclassified one is named
// after the action that failed — "what you typed is kept" only where
// something was typed (adding, editing), never after Masquer or a cancel.
// Nothing here is shown on a success, nor for an answer about an image the
// user has left (stale), nor for input the panel refused before sending.
import type { TranslationKey } from '@/lib/i18n/dictionaries';
import type { MaterialsErrorKind } from './node-materials-client';
import type { ActionResult } from './node-materials-state';

export type MaterialsAction =
  | 'read'
  | 'add'
  | 'save'
  | 'hide'
  | 'restore'
  | 'cancel'
  /** Attaching rows of the old sheet (étape 3C.5.4): the selection is kept. */
  | 'attach';

const KNOWN: Record<Exclude<MaterialsErrorKind, 'unknown'>, TranslationKey> = {
  validation: 'app.nodeMaterialsErrorValidation',
  session: 'app.nodeMaterialsErrorSession',
  not_found: 'app.nodeMaterialsErrorNotFound',
  conflict: 'app.nodeMaterialsErrorConflict',
  unavailable: 'app.nodeMaterialsErrorUnavailable',
  network: 'app.nodeMaterialsErrorNetwork',
};

const UNKNOWN: Record<MaterialsAction, TranslationKey> = {
  read: 'app.nodeMaterialsErrorRead',
  add: 'app.nodeMaterialsErrorAdd',
  save: 'app.materialsSaveError',
  hide: 'app.nodeMaterialsErrorHide',
  restore: 'app.nodeMaterialsErrorRestore',
  cancel: 'app.nodeMaterialsErrorCancel',
  attach: 'app.legacyAttachErrorUnknown',
};

/** The message of a classified failure; null for an unclassified one. */
export function knownErrorKey(error: MaterialsErrorKind): TranslationKey | null {
  return error === 'unknown' ? null : KNOWN[error];
}

/** The message of a failed action, classified or not. */
export function materialsErrorKey(
  action: MaterialsAction,
  error: MaterialsErrorKind,
): TranslationKey {
  return knownErrorKey(error) ?? UNKNOWN[action];
}

export interface ActionMessage {
  key: TranslationKey;
  /** The kind of failure, so the panel can offer Recharger on a conflict. */
  error: MaterialsErrorKind | 'busy' | 'exists';
  /** For 'exists': the canonical key of the face already listed. */
  face?: string;
}

/** What to tell after an action; null when there is nothing to tell. */
export function actionMessage(action: MaterialsAction, result: ActionResult): ActionMessage | null {
  if (result.ok || result.stale || result.error === 'invalid') return null;
  if (result.error === 'busy') return { key: 'app.nodeMaterialsErrorBusy', error: 'busy' };
  if (result.error === 'exists') {
    return { key: 'app.nodeMaterialsErrorExists', error: 'exists', face: result.existing.face };
  }
  return { key: materialsErrorKey(action, result.error), error: result.error };
}
