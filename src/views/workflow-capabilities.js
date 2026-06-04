import { asArray, escapeLabel, referenceIdentity, safeNodeId } from '../text.js';

export function generateWorkflowCapabilities(model) {
  const lines = ['flowchart LR'];
  const nodeLines = [];
  const edgeLines = [];
  const emittedNodes = new Set();

  for (const workflow of model.workflows.values()) {
    const workflowId = safeNodeId('W', workflow.identity);
    emitNode(nodeLines, emittedNodes, workflowId, `workflow: ${workflow.identity}`);

    const steps = asArray(workflow.document?.steps);
    for (const step of steps) {
      const capabilityIdentity = referenceIdentity(step, ['capability', 'ref', 'identity', 'id', 'name']);
      if (!capabilityIdentity) {
        edgeLines.push(`  %% skipped workflow step without capability reference in ${workflow.identity}`);
        continue;
      }

      const capability = model.capabilities.get(capabilityIdentity);
      const capabilityId = safeNodeId('C', capabilityIdentity);
      const label = capability
        ? `capability: ${capabilityIdentity}`
        : `missing capability: ${capabilityIdentity}`;
      emitNode(nodeLines, emittedNodes, capabilityId, label);
      edgeLines.push(`  ${workflowId} --> ${capabilityId}`);
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
