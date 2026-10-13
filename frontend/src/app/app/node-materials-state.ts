// The state of the per-image materials panel (étape 3C.4), kept out of React
// so it can be tested as it is: which image is shown, its faces as the server
// last confirmed them, what is being saved.
//
// Isolation between images does not rely on unmounting:
//   - every load carries a sequence number; an answer that is not the latest
//     one asked for (the user moved to another image, or reloaded) is
//     dropped — its list, and its error too;
//   - every mutation remembers the image it was started on; if the user has
//     moved on when it answers, the answer leaves the state alone (the
//     server did save it on THAT image: going back to it reloads it).
// Nothing is shown as saved before the server says so: a face changes only
// from the server's answer, never optimistically. One action at a time per
// face: a second click while one is running is refused, not queued.
import { canonicalizeFace } from '@/lib/server/materials/canonical-face';
import { normalizeCorrectionText } from '@/lib/server/materials/correction-text';
import {
  cancelCorrection,
  faceRef,
  listNodeMaterials,
  materialsErrorKind,
  removeFace,
  setFaceValue,
  type MaterialsErrorKind,
  type NodeFaceListItem,
  type NodeFaceMaterial,
} from './node-materials-client';

/** Same bounds as the corrections route (nodes/[nodeId]/materials/[face]). */
export const MAX_VALUE_LENGTH = 500;
export const MAX_LABEL_LENGTH = 200;

export type ValueCheck = { ok: true; valeur: string } | { ok: false; reason: 'empty' | 'too_long' };

/** A material's value as the server will store it, or why it would refuse it. */
export function checkValue(raw: string): ValueCheck {
  const valeur = normalizeCorrectionText(raw);
  if (!valeur) return { ok: false, reason: 'empty' };
  if (valeur.length > MAX_VALUE_LENGTH) return { ok: false, reason: 'too_long' };
  return { ok: true, valeur };
}

export type FaceCheck =
  | { ok: true; label: string; face: string }
  | { ok: false; reason: 'empty' | 'label_too_long' | 'key_too_long' };

/** A new face's name: the label kept as typed (normalised), its key for matching. */
export function checkNewFace(raw: string): FaceCheck {
  const label = normalizeCorrectionText(raw);
  const key = canonicalizeFace(label);
  if (!key.ok) return { ok: false, reason: key.reason === 'empty' ? 'empty' : 'key_too_long' };
  if (label.length > MAX_LABEL_LENGTH) return { ok: false, reason: 'label_too_long' };
  return { ok: true, label, face: key.face };
}

/**
 * The list once the server answered for one face: that face replaced (the
 * detection under it kept — no correction route changes it), a new face added
 * last, and a face left with nothing at all — no value, no correction, no
 * detection — taken out.
 */
export function mergeFace(
  items: readonly NodeFaceListItem[],
  material: NodeFaceMaterial,
): { items: NodeFaceListItem[]; item: NodeFaceListItem | null } {
  const previous = items.find((i) => i.face === material.face);
  const item: NodeFaceListItem = { ...material, detected: previous?.detected ?? null };
  if (item.correction === 'none' && item.origin === null && item.detected === null) {
    return { items: items.filter((i) => i.face !== material.face), item: null };
  }
  return {
    items: previous ? items.map((i) => (i.face === material.face ? item : i)) : [...items, item],
    item,
  };
}

export type PendingAction = 'save' | 'hide' | 'cancel' | 'add';

export interface NodeMaterialsState {
  nodeId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Why the list could not be read; null unless status is "error". */
  error: MaterialsErrorKind | null;
  items: NodeFaceListItem[];
  /** Faces (canonical key) with an action running. */
  pending: Readonly<Record<string, PendingAction>>;
}

export type ActionResult =
  /** item: the face as the server now has it; null when it is gone from the list. */
  | { ok: true; item: NodeFaceListItem | null; stale: boolean }
  | { ok: false; error: MaterialsErrorKind | 'busy' | 'invalid'; stale: boolean }
  /** An added face this image already lists: change it with Modifier instead. */
  | { ok: false; error: 'exists'; stale: false; existing: NodeFaceListItem };

export interface MaterialsClient {
  list: typeof listNodeMaterials;
  setValue: typeof setFaceValue;
  remove: typeof removeFace;
  cancel: typeof cancelCorrection;
}

const defaultClient: MaterialsClient = {
  list: listNodeMaterials,
  setValue: setFaceValue,
  remove: removeFace,
  cancel: cancelCorrection,
};

const IDLE: NodeMaterialsState = {
  nodeId: null,
  status: 'idle',
  error: null,
  items: [],
  pending: {},
};

/**
 * The state as the screen may show it while `selectedId` is the selected
 * image. The controller hears of a new selection only once React has run its
 * effect; until then its state still describes the previous image. That state
 * is never shown under the new image's name: the new image reads as loading
 * (as it is about to), no image as none. The state itself, unchanged, when it
 * already describes the selected image.
 */
export function viewFor(state: NodeMaterialsState, selectedId: string | null): NodeMaterialsState {
  if (state.nodeId === selectedId) return state;
  return selectedId ? { ...IDLE, nodeId: selectedId, status: 'loading' } : IDLE;
}

export class NodeMaterialsController {
  private state: NodeMaterialsState = IDLE;
  private readonly listeners = new Set<() => void>();
  private loadSeq = 0;

  constructor(
    private readonly projectId: string,
    private readonly client: MaterialsClient = defaultClient,
  ) {}

  getState = (): NodeMaterialsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<NodeMaterialsState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  /** Shows another image (null: none). Its faces are read afresh. */
  select = (nodeId: string | null): void => {
    if (nodeId === this.state.nodeId) return;
    this.loadSeq += 1;
    this.state = { ...IDLE, nodeId };
    if (nodeId) void this.load();
    else this.set({});
  };

  /** Reads the current image's faces again (after an error, a conflict…). */
  reload = (): Promise<void> => this.load();

  /**
   * The image's faces as another request just committed them (the attach of
   * étape 3C.5.4 answers with them): shown as they are, but only if that
   * image is still the one shown — otherwise nothing changes (it reads afresh
   * when selected again). A load still running for it is dropped: the list
   * given here is newer. Actions running on a face stay as they are.
   */
  replaceItems = (nodeId: string, items: NodeFaceListItem[]): boolean => {
    if (this.state.nodeId !== nodeId) return false;
    this.loadSeq += 1;
    this.set({ status: 'ready', error: null, items });
    return true;
  };

  private async load(): Promise<void> {
    const nodeId = this.state.nodeId;
    if (!nodeId) return;
    const seq = ++this.loadSeq;
    this.set({ status: 'loading', error: null });
    try {
      const items = await this.client.list(this.projectId, nodeId);
      if (seq !== this.loadSeq || this.state.nodeId !== nodeId) return;
      this.set({ status: 'ready', error: null, items });
    } catch (e) {
      if (seq !== this.loadSeq || this.state.nodeId !== nodeId) return;
      // Never an empty list in place of an unreadable one.
      this.set({ status: 'error', error: materialsErrorKind(e), items: [] });
    }
  }

  private async run(
    face: string,
    action: PendingAction,
    call: (nodeId: string) => Promise<NodeFaceMaterial>,
  ): Promise<ActionResult> {
    const nodeId = this.state.nodeId;
    if (!nodeId) return { ok: false, error: 'invalid', stale: false };
    if (this.state.pending[face]) return { ok: false, error: 'busy', stale: false };
    this.set({ pending: { ...this.state.pending, [face]: action } });

    const settle = (): boolean => {
      const stale = this.state.nodeId !== nodeId;
      if (!stale) {
        const pending = { ...this.state.pending };
        delete pending[face];
        this.state = { ...this.state, pending };
      }
      return stale;
    };

    try {
      const material = await call(nodeId);
      if (settle()) return { ok: true, item: null, stale: true };
      const merged = mergeFace(this.state.items, material);
      this.set({ items: merged.items });
      return { ok: true, item: merged.item, stale: false };
    } catch (e) {
      const stale = settle();
      if (!stale) this.set({});
      return { ok: false, error: materialsErrorKind(e), stale };
    }
  }

  private find(face: string): NodeFaceListItem | undefined {
    return this.state.items.find((i) => i.face === face);
  }

  /** Sets the value of a listed face (Modifier). */
  saveValue = (face: string, raw: string): Promise<ActionResult> => {
    const item = this.find(face);
    const value = checkValue(raw);
    if (!item || !value.ok) return Promise.resolve({ ok: false, error: 'invalid', stale: false });
    return this.run(face, 'save', (nodeId) =>
      this.client.setValue(this.projectId, nodeId, faceRef(item), value.valeur),
    );
  };

  /** Removes a listed face from this image (Masquer); its detection stays. */
  hide = (face: string): Promise<ActionResult> => {
    const item = this.find(face);
    if (!item) return Promise.resolve({ ok: false, error: 'invalid', stale: false });
    return this.run(face, 'hide', (nodeId) =>
      this.client.remove(this.projectId, nodeId, faceRef(item)),
    );
  };

  /** Cancels the correction of a listed face: back to its detection, if any. */
  cancel = (face: string): Promise<ActionResult> => {
    const item = this.find(face);
    if (!item || item.correction === 'none') {
      return Promise.resolve({ ok: false, error: 'invalid', stale: false });
    }
    return this.run(face, 'cancel', async (nodeId) => {
      const res = await this.client.cancel(this.projectId, nodeId, faceRef(item));
      return res.material;
    });
  };

  /**
   * Adds a face typed by the user. A face this image already lists — the same
   * canonical key, whatever the case, spaces or accents typed — is not
   * overwritten from here: the answer says so, and the face is changed with
   * its own Modifier. While an action runs on that face, the answer is "busy".
   */
  add = (rawLabel: string, rawValue: string): Promise<ActionResult> => {
    const name = checkNewFace(rawLabel);
    const value = checkValue(rawValue);
    if (!name.ok || !value.ok) {
      return Promise.resolve({ ok: false, error: 'invalid', stale: false });
    }
    if (this.state.pending[name.face]) {
      return Promise.resolve({ ok: false, error: 'busy', stale: false });
    }
    const existing = this.find(name.face);
    if (existing) {
      return Promise.resolve({ ok: false, error: 'exists', stale: false, existing });
    }
    return this.run(name.face, 'add', (nodeId) =>
      this.client.setValue(this.projectId, nodeId, name.label, value.valeur),
    );
  };
}
