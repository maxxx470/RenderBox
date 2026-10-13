// Attaching rows of the project's old materials sheet to the selected image
// (étape 3C.5.4) — the state of the selection, kept out of React so it can be
// tested as it is. The server decides what can be attached (planLegacyAttach,
// POST …/nodes/[nodeId]/legacy-attach); this only lets the user pick rows, shows what the
// server answered, and never reuses a selection for another image.
//
//   idle → selecting (rows ticked) → confirming (the summary) → submitting
//
//   - The target is always the image selected in the workspace, one image.
//     Another image selected: the selection is dropped, whatever the phase —
//     never carried over to the new image.
//   - Only rows the old sheet says are free can be ticked; at most 50 (the
//     route's limit); none ticked, nothing to confirm.
//   - One request at a time: submit() runs only from "confirming", and moves
//     to "submitting" before calling the server.
//   - An answer about an image the user has left (or a selection dropped
//     meanwhile) changes nothing here; it is reported as stale so the caller
//     only refreshes what is project-wide (the old sheet).
//   - A refusal keeps the selection: the blocked rows carry the server's
//     reason, the user unticks them and confirms again. Nothing is retried.
// Nothing here writes anything but this state: displaying, ticking or
// changing image sends no request.
import { LEGACY_ATTACH_MAX_ROWS } from '@/lib/server/materials/legacy-attach';
import type { MaterialRow } from './MaterialsPanel';
import {
  attachBlockedLines,
  attachLegacyMaterials,
  materialsErrorKind,
  type AttachBlockReason,
  type AttachResult,
  type MaterialsErrorKind,
} from './node-materials-client';

export const ATTACH_MAX_ROWS = LEGACY_ATTACH_MAX_ROWS;

/** A row of the old sheet as the selected image sees it. */
export type Availability =
  /** Attached nowhere: can be ticked. */
  | 'available'
  /** Already applied to the selected image. */
  | 'here'
  /** Attached to another image (named or not): one image per row. */
  | 'elsewhere'
  /** The sheet was read without attach marks: not offered. */
  | 'unknown';

export function availabilityOf(row: MaterialRow, targetNodeId: string | null): Availability {
  if (row.attached === undefined) return 'unknown';
  if (!row.attached) return 'available';
  if (targetNodeId !== null && row.attachedNodeId === targetNodeId) return 'here';
  return 'elsewhere';
}

export type AttachErrorKind = MaterialsErrorKind | 'blocked';

export interface LegacyAttachState {
  /** The image rows would be attached to: the one selected. */
  targetNodeId: string | null;
  phase: 'idle' | 'selecting' | 'confirming' | 'submitting';
  /** Ticked rows, in the order they were ticked. */
  selected: string[];
  /** The server's reason for each row it refused, from the last answer. */
  blocked: Readonly<Record<string, AttachBlockReason>>;
  /** Why the last request did not go through; null otherwise. */
  error: AttachErrorKind | null;
}

export type ToggleResult = 'ticked' | 'unticked' | 'limit' | 'unavailable' | 'ignored';

export type SubmitResult =
  | ({ kind: 'success'; nodeId: string; stale: boolean } & AttachResult)
  | { kind: 'failure'; nodeId: string; stale: boolean; error: AttachErrorKind }
  /** Not sent: nothing to confirm, or a request already running. */
  | { kind: 'ignored' };

export interface AttachClient {
  attach: typeof attachLegacyMaterials;
}

const defaultClient: AttachClient = { attach: attachLegacyMaterials };

const IDLE: Omit<LegacyAttachState, 'targetNodeId'> = {
  phase: 'idle',
  selected: [],
  blocked: {},
  error: null,
};

export class LegacyAttachController {
  private state: LegacyAttachState = { targetNodeId: null, ...IDLE };
  private readonly listeners = new Set<() => void>();
  /** Bumped whenever the selection is dropped: older answers are stale. */
  private seq = 0;

  constructor(
    private readonly projectId: string,
    private readonly client: AttachClient = defaultClient,
  ) {}

  getState = (): LegacyAttachState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: Partial<LegacyAttachState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) l();
  }

  /** The image selected in the workspace. Another one drops the selection. */
  setTarget = (nodeId: string | null): void => {
    if (nodeId === this.state.targetNodeId) return;
    this.seq += 1;
    this.set({ targetNodeId: nodeId, ...IDLE });
  };

  /** Starts picking rows for the selected image. */
  start = (): boolean => {
    if (!this.state.targetNodeId || this.state.phase !== 'idle') return false;
    this.set({ ...IDLE, phase: 'selecting' });
    return true;
  };

  /** Leaves the selection (not while a request runs). */
  cancel = (): void => {
    if (this.state.phase === 'submitting') return;
    this.seq += 1;
    this.set({ ...IDLE });
  };

  /** Ticks or unticks one row; only a free row can be ticked, 50 at most. */
  toggle = (row: MaterialRow): ToggleResult => {
    if (this.state.phase !== 'selecting') return 'ignored';
    const { selected, blocked } = this.state;
    if (selected.includes(row.id)) {
      const rest = { ...blocked };
      delete rest[row.id];
      this.set({ selected: selected.filter((id) => id !== row.id), blocked: rest });
      return 'unticked';
    }
    if (availabilityOf(row, this.state.targetNodeId) !== 'available') return 'unavailable';
    if (selected.length >= ATTACH_MAX_ROWS) return 'limit';
    this.set({ selected: [...selected, row.id] });
    return 'ticked';
  };

  /** To the summary, with 1 to 50 rows ticked. */
  review = (): boolean => {
    const n = this.state.selected.length;
    if (this.state.phase !== 'selecting' || n === 0 || n > ATTACH_MAX_ROWS) return false;
    this.set({ phase: 'confirming', error: null });
    return true;
  };

  /** Back from the summary to the rows. */
  back = (): void => {
    if (this.state.phase === 'confirming') this.set({ phase: 'selecting' });
  };

  /**
   * The old sheet was read again: a ticked row it no longer says is free
   * (attached meanwhile, gone) is unticked. Its server reason, if any, stays.
   */
  reconcile = (rows: readonly MaterialRow[]): void => {
    if (this.state.phase !== 'selecting' && this.state.phase !== 'confirming') return;
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    const keep = this.state.selected.filter((id) => {
      const row = byId.get(id);
      return row !== undefined && availabilityOf(row, this.state.targetNodeId) === 'available';
    });
    if (keep.length === this.state.selected.length) return;
    this.set({ selected: keep, phase: keep.length === 0 ? 'selecting' : this.state.phase });
  };

  /** Sends the ticked rows for the selected image — once, from the summary. */
  submit = async (): Promise<SubmitResult> => {
    const { phase, targetNodeId, selected } = this.state;
    if (phase !== 'confirming' || !targetNodeId || selected.length === 0) {
      return { kind: 'ignored' };
    }
    const seq = this.seq;
    const nodeId = targetNodeId;
    this.set({ phase: 'submitting', error: null });

    const stale = () => seq !== this.seq || this.state.targetNodeId !== nodeId;
    try {
      const result = await this.client.attach(this.projectId, nodeId, selected);
      if (stale()) return { kind: 'success', nodeId, stale: true, ...result };
      this.set({ ...IDLE });
      return { kind: 'success', nodeId, stale: false, ...result };
    } catch (e) {
      const blocked = attachBlockedLines(e);
      const error: AttachErrorKind = blocked ? 'blocked' : materialsErrorKind(e);
      if (stale()) return { kind: 'failure', nodeId, stale: true, error };
      // The selection stays, so the user can fix it and confirm again.
      this.set({ phase: 'selecting', error, blocked: blocked ?? {} });
      return { kind: 'failure', nodeId, stale: false, error };
    }
  };
}

/** The ticked rows, in the sheet's order, for the summary. */
export function selectedRows(rows: readonly MaterialRow[], selected: readonly string[]) {
  const ids = new Set(selected);
  return rows.filter((r) => ids.has(r.id));
}

/**
 * The state as the screen may show it while `nodeId` is the selected image:
 * the controller hears of a new selection only in React's effect, so for a
 * moment it may still hold the selection made for the previous image — never
 * shown under the new one. The state itself when it is about this image.
 */
export function attachViewFor(state: LegacyAttachState, nodeId: string | null): LegacyAttachState {
  return state.targetNodeId === nodeId ? state : { targetNodeId: nodeId, ...IDLE };
}
