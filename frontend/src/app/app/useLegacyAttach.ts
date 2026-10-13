'use client';

// The attach selection of the old materials sheet (étape 3C.5.4), for React:
// one LegacyAttachController per project screen, told which image is
// selected and when the sheet was read again. All the logic is in the
// controller (legacy-attach-state.ts), where it is tested. Nothing here sends
// a request: only submit(), called on the user's confirmation, does.
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { MaterialRow } from './MaterialsPanel';
import {
  LegacyAttachController,
  attachViewFor,
  type LegacyAttachState,
} from './legacy-attach-state';

export function useLegacyAttach(
  projectId: string,
  nodeId: string | null,
  rows: MaterialRow[],
): { state: LegacyAttachState; controller: LegacyAttachController } {
  const [controller] = useState(() => new LegacyAttachController(projectId));
  useEffect(() => {
    controller.setTarget(nodeId);
  }, [controller, nodeId]);
  useEffect(() => {
    controller.reconcile(rows);
  }, [controller, rows]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const view = useMemo(() => attachViewFor(state, nodeId), [state, nodeId]);
  return { state: view, controller };
}
