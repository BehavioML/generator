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
      if (isWorkflowReferenceStep(step)) {
        const childIdentity = resolveWorkflowReference(step.workflow);
        const childWorkflow = model.workflows.get(childIdentity);
        const childWorkflowId = safeNodeId('W', childIdentity);
        const label = childWorkflow
          ? `workflow: ${childIdentity}`
          : `missing workflow: ${childIdentity}`;
        emitNode(nodeLines, emittedNodes, childWorkflowId, label);
        edgeLines.push(`  ${workflowId} --> ${childWorkflowId}`);
        continue;
      }

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

function isWorkflowReferenceStep(step) {
  return step && typeof step === 'object' && !Array.isArray(step) && typeof step.workflow === 'string' && step.workflow.length > 0;
}

function resolveWorkflowReference(reference) {
  return String(reference ?? '')
    .replace(/^workflows\//, '')
    .replace(/\.ya?ml$/, '')
    .split('/')
    .filter(Boolean)
    .join('/');
}

function emitNode(lines, emittedNodes, id, label) {
  if (emittedNodes.has(id)) {
    return;
  }

  emittedNodes.add(id);
  lines.push(`  ${id}["${escapeLabel(label)}"]`);
}
