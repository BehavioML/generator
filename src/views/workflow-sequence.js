import { escapeMermaidText, humanizeIdentity } from '../text.js';

export function generateWorkflowSequence(model, workflowIdentity) {
  if (!workflowIdentity) {
    throw new Error('workflow-sequence view requires --workflow <workflow>');
  }

  const workflow = model.workflows.get(workflowIdentity);
  if (!workflow) {
    throw new Error(`Workflow not found: ${workflowIdentity}`);
  }

  const steps = workflow.document?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`workflow-sequence view requires steps in workflows/${workflow.identity}.yaml`);
  }

  const participants = workflowParticipants(workflow);
  const participantSet = new Set(participants);
  const source = `workflows/${workflow.identity}.yaml`;
  const lines = ['sequenceDiagram'];

  for (const participant of participants) {
    lines.push(`  participant ${participant} as ${escapeMermaidText(humanizeIdentity(participant))}`);
  }

  lines.push('');

  steps.forEach((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`workflow-sequence view requires object workflow steps; found legacy string step at ${source} steps[${index}]`);
    }

    if (Object.hasOwn(step, 'at')) {
      throw new Error('workflow-sequence does not support at; use from without to for local steps');
    }

    const from = step.from;
    const to = step.to;

    if (typeof from !== 'string' || from.length === 0) {
      throw new Error(`workflow-sequence view requires from at ${source} steps[${index}]`);
    }

    if (Object.hasOwn(step, 'to') && (typeof to !== 'string' || to.length === 0)) {
      throw new Error(`workflow-sequence view requires non-empty to at ${source} steps[${index}]`);
    }

    if (!participantSet.has(from)) {
      throw new Error(`workflow-sequence step uses undeclared from role "${from}" at ${source} steps[${index}]`);
    }

    if (to !== undefined && !participantSet.has(to)) {
      throw new Error(`workflow-sequence step uses undeclared to role "${to}" at ${source} steps[${index}]`);
    }

    const label = stepLabel(step, source, index);
    if (to) {
      lines.push(`  ${from}->>${to}: ${label}`);
    } else {
      lines.push(`  Note over ${from}: ${label}`);
    }
  });

  return `${lines.join('\n').trimEnd()}\n`;
}

function workflowParticipants(workflow) {
  const roles = workflow.document?.roles;
  const participants = [];

  if (typeof roles?.primary === 'string' && roles.primary.length > 0) {
    participants.push(roles.primary);
  }

  if (Array.isArray(roles?.participants)) {
    for (const participant of roles.participants) {
      if (typeof participant === 'string' && participant.length > 0 && !participants.includes(participant)) {
        participants.push(participant);
      }
    }
  }

  return participants;
}

function stepLabel(step, source, index) {
  if (typeof step.label === 'string' && step.label.length > 0) {
    return escapeMermaidText(step.label);
  }

  if (typeof step.capability === 'string' && step.capability.length > 0) {
    return escapeMermaidText(humanizeIdentity(step.capability.split('/').at(-1)));
  }

  throw new Error(`workflow-sequence step requires label or capability at ${source} steps[${index}]`);
}
