import { escapeLabel, referenceIdentity, safeNodeId } from '../text.js';

export function generateEntityStateMachines(model) {
  const lines = ['flowchart LR'];
  const nodeLines = [];
  const edgeLines = [];
  const emittedNodes = new Set();

  for (const entity of model.entities.values()) {
    const entityId = safeNodeId('E', entity.identity);
    emitNode(nodeLines, emittedNodes, entityId, `entity: ${entity.identity}`);
  }

  for (const stateMachine of model['state-machines'].values()) {
    const stateMachineId = safeNodeId('SM', stateMachine.identity);
    emitNode(nodeLines, emittedNodes, stateMachineId, `state-machine: ${stateMachine.identity}`);

    const entityIdentity = referenceIdentity(stateMachine.document?.entity, ['entity', 'ref', 'identity', 'id', 'name']);
    if (!entityIdentity) {
      continue;
    }

    const entity = model.entities.get(entityIdentity);
    const entityId = safeNodeId('E', entityIdentity);
    const label = entity ? `entity: ${entityIdentity}` : `missing entity: ${entityIdentity}`;
    emitNode(nodeLines, emittedNodes, entityId, label);
    edgeLines.push(`  ${entityId} --> ${stateMachineId}`);
  }

  return [...lines, ...nodeLines, '', ...edgeLines].filter((line, index, all) => line !== '' || all[index + 1]).join('\n').trimEnd() + '\n';
}

function emitNode(lines, emittedNodes, id, label) {
  if (emittedNodes.has(id)) {
    return;
  }

  emittedNodes.add(id);
  lines.push(`  ${id}["${escapeLabel(label)}"]`);
}
