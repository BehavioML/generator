import { escapeMermaidText, humanizeIdentity, referenceIdentity } from '../text.js';

const EXPAND_USES_NONE = 'none';
const EXPAND_USES_ONE_LEVEL = 'one-level';
const EXPAND_USES_RECURSIVE = 'recursive';
const WORKFLOW_COMPOSITION_COLLAPSED = 'collapsed';
const WORKFLOW_COMPOSITION_EXPANDED = 'expanded';

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
  const workflowComposition = normalizeWorkflowComposition(options.workflowComposition);
  const renderSteps = workflowComposition === WORKFLOW_COMPOSITION_EXPANDED
    ? expandedWorkflowSteps(model, workflow)
    : collapsedWorkflowSteps(model, workflow);
  const participants = workflowSequenceParticipants(workflow, renderSteps);
  const lines = ['sequenceDiagram'];

  for (const participant of participants) {
    lines.push(`  participant ${participant} as ${escapeMermaidText(humanizeIdentity(participant))}`);
  }

  lines.push('');

  for (const renderStep of renderSteps) {
    if (renderStep.kind === 'workflow') {
      lines.push(`  Note over ${renderStep.participants.join(',')}: Child workflow\: ${escapeMermaidText(renderStep.reference)}`);
      continue;
    }

    if (renderStep.to) {
      lines.push(`  ${renderStep.from}->>${renderStep.to}: ${renderStep.label}`);
    } else {
      lines.push(`  Note over ${renderStep.from}: ${renderStep.label}`);
    }

    if (expandUses !== EXPAND_USES_NONE && renderStep.capability) {
      const expandedUses = expandedCapabilityUses(model, renderStep.capability, expandUses);
      if (expandedUses.length > 0) {
        const noteParticipant = renderStep.to ?? renderStep.from;
        lines.push(`  Note over ${noteParticipant}: ${expandedUses.map(formatExpandedUse).join('<br/>')}`);
      }
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function normalizeWorkflowComposition(workflowComposition) {
  if (workflowComposition === undefined || workflowComposition === null) {
    return WORKFLOW_COMPOSITION_COLLAPSED;
  }

  if (workflowComposition === WORKFLOW_COMPOSITION_COLLAPSED || workflowComposition === WORKFLOW_COMPOSITION_EXPANDED) {
    return workflowComposition;
  }

  throw new Error(`Unsupported workflow-sequence --workflow-composition mode: ${workflowComposition}`);
}

function collapsedWorkflowSteps(model, workflow) {
  const source = workflowSource(workflow);
  const steps = requireWorkflowSteps(workflow);
  const declaredParticipants = workflowParticipants(workflow);

  return steps.map((step, index) => {
    const classification = classifyWorkflowStep(step, source, index);
    if (classification === 'workflow') {
      const childIdentity = resolveWorkflowReference(step.workflow);
      if (!model.workflows.has(childIdentity)) {
        throw new Error(`Unresolved child workflow reference "${step.workflow}" at ${source} steps[${index}]`);
      }

      const bind = validatedWorkflowBind(step, source, index);
      return {
        kind: 'workflow',
        reference: workflowReferenceLabel(step.workflow),
        participants: unique(Object.values(bind))
      };
    }

    return renderableCapabilityStep(model, step, source, index, identityRoleMapper, declaredParticipants);
  });
}

function expandedWorkflowSteps(model, workflow) {
  const rootRoles = workflowParticipants(workflow);
  for (const role of collectBindTargetRoles(workflow)) {
    if (!rootRoles.includes(role)) {
      rootRoles.push(role);
    }
  }

  const rootBinding = Object.fromEntries(rootRoles.map((role) => [role, role]));
  return expandWorkflow(model, workflow, rootBinding, [workflow.identity]);
}

function expandWorkflow(model, workflow, roleBinding, ancestors) {
  const source = workflowSource(workflow);
  const steps = requireWorkflowSteps(workflow);
  const declaredParticipants = workflowParticipants(workflow);
  const renderSteps = [];

  steps.forEach((step, index) => {
    const classification = classifyWorkflowStep(step, source, index);
    if (classification === 'capability') {
      renderSteps.push(renderableCapabilityStep(
        model,
        step,
        source,
        index,
        (role) => mapRole(role, roleBinding, source, index),
        declaredParticipants
      ));
      return;
    }

    const childIdentity = resolveWorkflowReference(step.workflow);
    const childWorkflow = model.workflows.get(childIdentity);
    if (!childWorkflow) {
      throw new Error(`Unresolved child workflow reference "${step.workflow}" at ${source} steps[${index}]`);
    }

    const bind = validatedWorkflowBind(step, source, index);
    const childRoles = usedWorkflowRoles(childWorkflow, model, [workflow.identity]);
    for (const childRole of childRoles) {
      if (!Object.hasOwn(bind, childRole)) {
        throw new Error(`Missing bind for child role "${childRole}" in workflow reference "${step.workflow}" at ${source} steps[${index}]`);
      }
    }

    if (ancestors.includes(childIdentity)) {
      renderSteps.push({
        kind: 'workflow',
        reference: `${workflowReferenceLabel(step.workflow)} (cycle detected)`,
        participants: unique(Object.values(bind).map((role) => mapRole(role, roleBinding, source, index)))
      });
      return;
    }

    const childBinding = Object.fromEntries(Object.entries(bind).map(([childRole, parentRole]) => [
      childRole,
      mapRole(parentRole, roleBinding, source, index)
    ]));
    renderSteps.push(...expandWorkflow(model, childWorkflow, childBinding, [...ancestors, childIdentity]));
  });

  return renderSteps;
}

function renderableCapabilityStep(model, step, source, index, roleMapper, declaredParticipants = []) {
  const from = step.from;
  const to = step.to;

  if (typeof from !== 'string' || from.length === 0) {
    throw new Error(`workflow-sequence view requires from at ${source} steps[${index}]`);
  }

  if (Object.hasOwn(step, 'to') && (typeof to !== 'string' || to.length === 0)) {
    throw new Error(`workflow-sequence view requires non-empty to at ${source} steps[${index}]`);
  }

  validateDeclaredRole(from, declaredParticipants, 'from', source, index);
  if (to !== undefined) {
    validateDeclaredRole(to, declaredParticipants, 'to', source, index);
  }

  return {
    kind: 'capability',
    from: roleMapper(from),
    ...(to !== undefined ? { to: roleMapper(to) } : {}),
    capability: referenceIdentity(step, ['capability', 'ref', 'identity', 'id', 'name']),
    label: stepLabel(step, source, index)
  };
}

function validateDeclaredRole(role, declaredParticipants, field, source, index) {
  if (declaredParticipants.length > 0 && !declaredParticipants.includes(role)) {
    throw new Error(`workflow-sequence step uses undeclared ${field} role "${role}" at ${source} steps[${index}]`);
  }
}

function classifyWorkflowStep(step, source, index) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error(`workflow-sequence view requires object workflow steps; found legacy string step at ${source} steps[${index}]`);
  }

  if (Object.hasOwn(step, 'at')) {
    throw new Error('workflow-sequence does not support at; use from without to for local steps');
  }

  if (Object.hasOwn(step, 'workflow')) {
    if (typeof step.workflow !== 'string' || step.workflow.length === 0) {
      throw new Error(`workflow reference step requires non-empty workflow at ${source} steps[${index}]`);
    }

    const mixedFields = ['from', 'to', 'capability', 'label'].filter((field) => Object.hasOwn(step, field));
    if (mixedFields.length > 0) {
      throw new Error(`workflow reference step must not include ${mixedFields.join(', ')} at ${source} steps[${index}]`);
    }

    return 'workflow';
  }

  return 'capability';
}

function validatedWorkflowBind(step, source, index) {
  if (!Object.hasOwn(step, 'bind')) {
    throw new Error(`workflow reference step requires bind at ${source} steps[${index}]`);
  }

  if (!step.bind || typeof step.bind !== 'object' || Array.isArray(step.bind)) {
    throw new Error(`workflow reference step requires bind to be a mapping at ${source} steps[${index}]`);
  }

  const entries = Object.entries(step.bind);
  if (entries.length === 0) {
    throw new Error(`workflow reference step requires non-empty bind at ${source} steps[${index}]`);
  }

  for (const [childRole, parentRole] of entries) {
    if (typeof childRole !== 'string' || childRole.length === 0 || typeof parentRole !== 'string' || parentRole.length === 0) {
      throw new Error(`workflow reference step requires bind role names to be non-empty strings at ${source} steps[${index}]`);
    }
  }

  return step.bind;
}

function usedWorkflowRoles(workflow, model, ancestors) {
  const roles = new Set();
  const source = workflowSource(workflow);

  for (const [index, step] of requireWorkflowSteps(workflow).entries()) {
    const classification = classifyWorkflowStep(step, source, index);
    if (classification === 'capability') {
      if (typeof step.from === 'string' && step.from.length > 0) {
        roles.add(step.from);
      }
      if (typeof step.to === 'string' && step.to.length > 0) {
        roles.add(step.to);
      }
      continue;
    }

    const bind = validatedWorkflowBind(step, source, index);
    for (const role of Object.values(bind)) {
      roles.add(role);
    }

    const childIdentity = resolveWorkflowReference(step.workflow);
    if (ancestors.includes(childIdentity)) {
      continue;
    }

    const childWorkflow = model.workflows.get(childIdentity);
    if (childWorkflow) {
      for (const childRole of usedWorkflowRoles(childWorkflow, model, [...ancestors, childIdentity])) {
        if (!Object.hasOwn(bind, childRole)) {
          roles.add(childRole);
        }
      }
    }
  }

  return roles;
}

function collectBindTargetRoles(workflow) {
  const roles = [];
  const steps = Array.isArray(workflow.document?.steps) ? workflow.document.steps : [];
  for (const step of steps) {
    if (step && typeof step === 'object' && !Array.isArray(step) && Object.hasOwn(step, 'workflow') && step.bind && typeof step.bind === 'object' && !Array.isArray(step.bind)) {
      for (const role of Object.values(step.bind)) {
        if (typeof role === 'string' && role.length > 0 && !roles.includes(role)) {
          roles.push(role);
        }
      }
    }
  }
  return roles;
}

function mapRole(role, roleBinding, source, index) {
  if (Object.hasOwn(roleBinding, role)) {
    return roleBinding[role];
  }

  throw new Error(`Missing bind for child role "${role}" during expansion at ${source} steps[${index}]`);
}

function identityRoleMapper(role) {
  return role;
}

function workflowSequenceParticipants(workflow, renderSteps) {
  const participants = workflowParticipants(workflow);

  for (const step of renderSteps) {
    if (step.kind === 'workflow') {
      for (const participant of step.participants) {
        if (!participants.includes(participant)) {
          participants.push(participant);
        }
      }
      continue;
    }

    for (const participant of [step.from, step.to].filter(Boolean)) {
      if (!participants.includes(participant)) {
        participants.push(participant);
      }
    }
  }

  return participants;
}

function requireWorkflowSteps(workflow) {
  const steps = workflow.document?.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error(`workflow-sequence view requires steps in workflows/${workflow.identity}.yaml`);
  }

  return steps;
}

function workflowSource(workflow) {
  return `workflows/${workflow.identity}.yaml`;
}

function resolveWorkflowReference(reference) {
  return String(reference ?? '')
    .replace(/^workflows\//, '')
    .replace(/\.ya?ml$/, '')
    .split('/')
    .filter(Boolean)
    .join('/');
}

function workflowReferenceLabel(reference) {
  const identity = resolveWorkflowReference(reference);
  return reference.startsWith('workflows/') ? `workflows/${identity}` : identity;
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))];
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
