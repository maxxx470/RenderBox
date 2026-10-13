'use client';

// The per-image materials of the selected image (étape 3C.4), for React: one
// NodeMaterialsController per project screen, told which image is selected.
// All the logic — stale answers, one action per face — is in the controller
// (node-materials-state.ts), where it is tested.
//
// The state handed back is always about `nodeId` (viewFor): the controller
// hears of a new selection only in the effect below, after React has drawn
// the new image's name, so for that moment its state still describes the
// previous image — never shown under the new name (étape 3C.4-S).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { NodeMaterialsController, viewFor, type NodeMaterialsState } from './node-materials-state';

export function useNodeMaterials(
  projectId: string,
  nodeId: string | null,
): { state: NodeMaterialsState; controller: NodeMaterialsController } {
  const [controller] = useState(() => new NodeMaterialsController(projectId));
  useEffect(() => {
    controller.select(nodeId);
  }, [controller, nodeId]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState,
  );
  const view = useMemo(() => viewFor(state, nodeId), [state, nodeId]);
  return { state: view, controller };
}
