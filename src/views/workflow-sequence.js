import { escapeMermaidText, humanizeIdentity, referenceIdentity } from '../text.js';

const EXPAND_USES_NONE = 'none';
const EXPAND_USES_ONE_LEVEL = 'one-level';
const EXPAND_USES_RECURSIVE = 'recursive';

export function generateWorkflowSequence(model, workflowIdentity, options = {}) {
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

  const expandUses = normalizeExpandUses(options.expandUses);
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

    const capabilityIdentity = referenceIdentity(step, ['capability', 'ref', 'identity', 'id', 'name']);
    if (expandUses !== EXPAND_USES_NONE && capabilityIdentity) {
      const expandedUses = expandedCapabilityUses(model, capabilityIdentity, expandUses);
      if (expandedUses.length > 0) {
        const noteParticipant = to ?? from;
        lines.push(`  Note over ${noteParticipant}: ${expandedUses.map(formatExpandedUse).join('<br/>')}`);
      }
    }
  });

  return `${lines.join('\n').trimEnd()}\n`;
}

function normalizeExpandUses(expandUses) {
  if (expandUses === true) {
    return EXPAND_USES_ONE_LEVEL;
  }

  if (expandUses === undefined || expandUses === null || expandUses === false || expandUses === EXPAND_USES_NONE) {
    return EXPAND_USES_NONE;
  }

  if (expandUses === EXPAND_USES_ONE_LEVEL || expandUses === EXPAND_USES_RECURSIVE) {
    return expandUses;
  }

  throw new Error(`Unsupported workflow-sequence --expand-uses mode: ${expandUses}`);
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

function expandedCapabilityUses(model, capabilityIdentity, expandUses) {
  const capability = model.capabilities.get(capabilityIdentity);
  const uses = capabilityUses(capability);

  if (uses.length === 0) {
    return [];
  }

  return uses.flatMap((usedIdentity, index) => expandCapabilityUse(model, usedIdentity, `${index + 1}`, expandUses, [capabilityIdentity]));
}

function expandCapabilityUse(model, capabilityIdentity, number, expandUses, ancestors) {
  const rows = [{ number, label: capabilityLabel(model, capabilityIdentity) }];

  if (expandUses !== EXPAND_USES_RECURSIVE) {
    return rows;
  }

  if (ancestors.includes(capabilityIdentity)) {
    rows[0].cycle = true;
    return rows;
  }

  const capability = model.capabilities.get(capabilityIdentity);
  const uses = capabilityUses(capability);
  return [
    ...rows,
    ...uses.flatMap((usedIdentity, index) => expandCapabilityUse(
      model,
      usedIdentity,
      `${number}.${index + 1}`,
      expandUses,
      [...ancestors, capabilityIdentity]
    ))
  ];
}

function capabilityUses(capability) {
  if (!Array.isArray(capability?.document?.uses)) {
    return [];
  }

  return capability.document.uses
    .map((use) => referenceIdentity(use, ['capability', 'ref', 'identity', 'id', 'name']))
    .filter((identity) => typeof identity === 'string' && identity.length > 0);
}

function capabilityLabel(model, capabilityIdentity) {
  const capability = model.capabilities.get(capabilityIdentity);
  const name = capability?.document?.name;
  return escapeMermaidText(typeof name === 'string' && name.length > 0
    ? name
    : humanizeIdentity(capabilityIdentity.split('/').at(-1)));
}

function formatExpandedUse(row) {
  const suffix = row.cycle ? ' (cycle detected)' : '';
  return `${row.number}. ${row.label}${suffix}`;
}
