import { asArray, escapeLabel, referenceIdentity, safeNodeId } from '../text.js';

export function generateSemanticAreaWorkflows(model, semanticAreaIdentity) {
  const semanticAreas = semanticAreaIdentity
    ? [model['semantic-areas'].get(semanticAreaIdentity)].filter(Boolean)
    : [...model['semantic-areas'].values()];

  if (semanticAreaIdentity && semanticAreas.length === 0) {
    throw new Error(`Semantic area not found: ${semanticAreaIdentity}`);
  }

  const lines = ['flowchart LR'];
  const nodeLines = [];
  const edgeLines = [];
  const emittedNodes = new Set();

  for (const semanticArea of semanticAreas) {
    const semanticAreaId = safeNodeId('SA', semanticArea.identity);
    emitNode(nodeLines, emittedNodes, semanticAreaId, `semantic-area: ${semanticArea.identity}`);

    for (const workflowRef of asArray(semanticArea.document?.workflows)) {
      const workflowIdentity = referenceIdentity(workflowRef, ['workflow', 'ref', 'identity', 'id', 'name']);
      if (!workflowIdentity) {
        edgeLines.push(`  %% skipped semantic area workflow without workflow reference in ${semanticArea.identity}`);
        continue;
      }

      const workflow = model.workflows.get(workflowIdentity);
      const workflowId = safeNodeId('W', workflowIdentity);
      const label = workflow
        ? `workflow: ${workflowIdentity}`
        : `missing workflow: ${workflowIdentity}`;
      emitNode(nodeLines, emittedNodes, workflowId, label);
      edgeLines.push(`  ${semanticAreaId} --> ${workflowId}`);
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
