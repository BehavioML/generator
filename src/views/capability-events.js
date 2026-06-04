import { asArray, escapeLabel, referenceIdentity, safeNodeId } from '../text.js';

export function generateCapabilityEvents(model) {
  const lines = ['flowchart LR'];
  const nodeLines = [];
  const edgeLines = [];
  const emittedNodes = new Set();

  for (const capability of model.capabilities.values()) {
    const capabilityId = safeNodeId('C', capability.identity);
    emitNode(nodeLines, emittedNodes, capabilityId, `capability: ${capability.identity}`);

    for (const eventRef of asArray(capability.document?.events)) {
      const eventIdentity = referenceIdentity(eventRef, ['event', 'ref', 'identity', 'id', 'name']);
      if (!eventIdentity) {
        edgeLines.push(`  %% skipped capability event without event reference in ${capability.identity}`);
        continue;
      }

      const event = model.events.get(eventIdentity);
      const eventId = safeNodeId('E', eventIdentity);
      const label = event ? `event: ${eventIdentity}` : `missing event: ${eventIdentity}`;
      emitNode(nodeLines, emittedNodes, eventId, label);
      edgeLines.push(`  ${capabilityId} --> ${eventId}`);
    }
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
