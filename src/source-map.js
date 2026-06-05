import { asArray, humanizeIdentity, referenceIdentity, safeNodeId } from './text.js';

export function generateSourceMap(model, kind, options = {}) {
  switch (kind) {
    case 'workflow-sequence':
      return workflowSequenceSourceMap(model, options.workflow);
    case 'state-machines':
      return stateMachinesSourceMap(model);
    case 'workflow-capabilities':
      return workflowCapabilitiesSourceMap(model);
    case 'capability-events':
      return capabilityEventsSourceMap(model);
    case 'entity-state-machines':
      return entityStateMachinesSourceMap(model);
    default:
      return undefined;
  }
}

function workflowSequenceSourceMap(model, workflowIdentity) {
  if (!workflowIdentity) {
    return undefined;
  }

  const workflow = model.workflows.get(workflowIdentity);
  if (!workflow) {
    return undefined;
  }

  const entries = [sourceMapEntry({
    diagramId: safeDiagramId('workflow', workflow.identity),
    role: 'entity',
    scope: 'workflows',
    identity: workflow.identity,
    label: workflow.document?.name ?? workflow.identity
  })];

  for (const participant of workflowParticipants(workflow)) {
    entries.push(sourceMapEntry({
      diagramId: safeDiagramId('participant', participant),
      role: 'participant',
      scope: 'roles',
      identity: participant,
      label: humanizeIdentity(participant)
    }));
  }

  for (const [index, step] of asArray(workflow.document?.steps).entries()) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      continue;
    }

    const stepId = safeDiagramId('workflow-step', `${workflow.identity}-${stepIdentity(step, index)}`);
    entries.push(sourceMapEntry({
      diagramId: stepId,
      role: step.to ? 'edge' : 'step',
      scope: 'workflows',
      identity: workflow.identity,
      fieldPath: `steps[${index}]`,
      label: rawStepLabel(step)
    }));

    const capabilityIdentity = referenceIdentity(step, ['capability', 'ref', 'identity', 'id', 'name']);
    if (capabilityIdentity) {
      entries.push(sourceMapEntry({
        diagramId: safeDiagramId('workflow-step-capability', `${workflow.identity}-${index}-${capabilityIdentity}`),
        role: 'target',
        scope: 'capabilities',
        identity: capabilityIdentity,
        fieldPath: `steps[${index}].capability`,
        label: rawStepLabel(step) ?? capabilityIdentity
      }));
    }

    if (typeof step.from === 'string' && step.from.length > 0) {
      entries.push(sourceMapEntry({
        diagramId: safeDiagramId('workflow-step-source', `${workflow.identity}-${index}-${step.from}`),
        role: 'source',
        scope: 'roles',
        identity: step.from,
        fieldPath: `steps[${index}].from`,
        label: humanizeIdentity(step.from)
      }));
    }

    if (typeof step.to === 'string' && step.to.length > 0) {
      entries.push(sourceMapEntry({
        diagramId: safeDiagramId('workflow-step-target', `${workflow.identity}-${index}-${step.to}`),
        role: 'target',
        scope: 'roles',
        identity: step.to,
        fieldPath: `steps[${index}].to`,
        label: humanizeIdentity(step.to)
      }));
    }
  }

  return entries;
}

function stateMachinesSourceMap(model) {
  const entries = [];

  for (const stateMachine of model['state-machines'].values()) {
    entries.push(sourceMapEntry({
      diagramId: safeDiagramId('state-machine', stateMachine.identity),
      role: 'entity',
      scope: 'state-machines',
      identity: stateMachine.identity,
      label: stateMachine.document?.name ?? stateMachine.identity
    }));

    for (const [index, state] of asArray(stateMachine.document?.states).entries()) {
      const stateName = stateNameFrom(state);
      if (!stateName) {
        continue;
      }

      entries.push(sourceMapEntry({
        diagramId: safeDiagramId('state', `${stateMachine.identity}-${stateName}`),
        role: 'state',
        scope: 'state-machines',
        identity: stateMachine.identity,
        fieldPath: `states[${index}]`,
        label: stateName
      }));
    }

    for (const [index, transition] of asArray(stateMachine.document?.transitions).entries()) {
      if (!transition || typeof transition !== 'object' || Array.isArray(transition)) {
        continue;
      }

      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
      const toState = transition.to;
      if (!fromStates.length || !fromStates.every((from) => typeof from === 'string' && from.length > 0) || typeof toState !== 'string' || toState.length === 0) {
        continue;
      }

      for (const [fromIndex, fromState] of fromStates.entries()) {
        entries.push(sourceMapEntry({
          diagramId: safeDiagramId('transition', `${stateMachine.identity}-${index}-${fromState}-${toState}`),
          role: 'transition',
          scope: 'state-machines',
          identity: stateMachine.identity,
          fieldPath: `transitions[${index}]${fromStates.length > 1 ? `.from[${fromIndex}]` : ''}`,
          label: transition.on ? `${fromState} → ${toState}: ${transition.on}` : `${fromState} → ${toState}`
        }));
      }

      const eventIdentity = referenceIdentity(transition.on, ['event', 'ref', 'identity', 'id', 'name']);
      if (eventIdentity) {
        entries.push(sourceMapEntry({
          diagramId: safeDiagramId('transition-event', `${stateMachine.identity}-${index}-${eventIdentity}`),
          role: 'edge',
          scope: 'events',
          identity: eventIdentity,
          fieldPath: `transitions[${index}].on`,
          label: eventIdentity
        }));
      }
    }
  }

  return entries;
}

function workflowCapabilitiesSourceMap(model) {
  const entries = [];

  for (const workflow of model.workflows.values()) {
    entries.push(sourceMapEntry({
      diagramId: safeDiagramId('workflow', workflow.identity),
      role: 'entity',
      scope: 'workflows',
      identity: workflow.identity,
      label: workflow.identity
    }));

    for (const [index, step] of asArray(workflow.document?.steps).entries()) {
      const capabilityIdentity = referenceIdentity(step, ['capability', 'ref', 'identity', 'id', 'name']);
      if (!capabilityIdentity) {
        continue;
      }

      entries.push(sourceMapEntry({
        diagramId: safeDiagramId('workflow-capability', `${workflow.identity}-${index}-${capabilityIdentity}`),
        role: 'edge',
        scope: 'capabilities',
        identity: capabilityIdentity,
        fieldPath: `steps[${index}].capability`,
        label: capabilityIdentity
      }));
    }
  }

  return entries;
}

function capabilityEventsSourceMap(model) {
  const entries = [];

  for (const capability of model.capabilities.values()) {
    entries.push(sourceMapEntry({
      diagramId: safeDiagramId('capability', capability.identity),
      role: 'entity',
      scope: 'capabilities',
      identity: capability.identity,
      label: capability.identity
    }));

    for (const [index, eventRef] of asArray(capability.document?.events).entries()) {
      const eventIdentity = referenceIdentity(eventRef, ['event', 'ref', 'identity', 'id', 'name']);
      if (!eventIdentity) {
        continue;
      }

      entries.push(sourceMapEntry({
        diagramId: safeDiagramId('capability-event', `${capability.identity}-${index}-${eventIdentity}`),
        role: 'edge',
        scope: 'events',
        identity: eventIdentity,
        fieldPath: `events[${index}]`,
        label: eventIdentity
      }));
    }
  }

  return entries;
}

function entityStateMachinesSourceMap(model) {
  const entries = [];

  for (const entity of model.entities.values()) {
    entries.push(sourceMapEntry({
      diagramId: safeDiagramId('entity', entity.identity),
      role: 'entity',
      scope: 'entities',
      identity: entity.identity,
      label: entity.identity
    }));
  }

  for (const stateMachine of model['state-machines'].values()) {
    entries.push(sourceMapEntry({
      diagramId: safeDiagramId('state-machine', stateMachine.identity),
      role: 'entity',
      scope: 'state-machines',
      identity: stateMachine.identity,
      label: stateMachine.identity
    }));

    const entityIdentity = referenceIdentity(stateMachine.document?.entity, ['entity', 'ref', 'identity', 'id', 'name']);
    if (!entityIdentity) {
      continue;
    }

    entries.push(sourceMapEntry({
      diagramId: safeDiagramId('entity-state-machine', `${entityIdentity}-${stateMachine.identity}`),
      role: 'edge',
      scope: 'entities',
      identity: entityIdentity,
      fieldPath: 'entity',
      label: entityIdentity
    }));
  }

  return entries;
}

function sourceMapEntry({ diagramId, role, scope, identity, fieldPath, label }) {
  return {
    diagramId,
    role,
    entity: { scope, identity },
    ...(fieldPath ? { fieldPath } : {}),
    ...(label ? { label } : {})
  };
}

function safeDiagramId(prefix, identity) {
  return safeNodeId(prefix, identity).replaceAll('_', '-');
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

function stepIdentity(step, index) {
  const capabilityIdentity = referenceIdentity(step, ['capability', 'ref', 'identity', 'id', 'name']);
  return [index, step.from, step.to, capabilityIdentity, rawStepLabel(step)].filter(Boolean).join('-');
}

function rawStepLabel(step) {
  if (typeof step.label === 'string' && step.label.length > 0) {
    return step.label;
  }

  if (typeof step.capability === 'string' && step.capability.length > 0) {
    return humanizeIdentity(step.capability.split('/').at(-1));
  }

  return undefined;
}

function stateNameFrom(state) {
  if (typeof state === 'string') {
    return state;
  }

  if (!state || typeof state !== 'object') {
    return undefined;
  }

  return state.name ?? state.id ?? state.identity;
}
