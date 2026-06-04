import { asArray } from '../text.js';

export function generateStateMachines(model) {
  const diagrams = [...model['state-machines'].values()].map(renderStateMachine);
  return diagrams.join('\n\n').trimEnd() + '\n';
}

function renderStateMachine(stateMachine) {
  const lines = [
    `%% state-machine: ${stateMachine.identity}`,
    'stateDiagram-v2'
  ];
  const declaredStates = new Set();

  for (const state of asArray(stateMachine.document?.states)) {
    const stateName = stateNameFrom(state);
    if (!stateName) {
      lines.push('  %% skipped state declaration without state name');
      continue;
    }

    declaredStates.add(stateName);
    lines.push(`  state ${stateName}`);
  }

  for (const transition of asArray(stateMachine.document?.transitions)) {
    if (!transition || typeof transition !== 'object') {
      lines.push('  %% skipped malformed transition');
      continue;
    }

    const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from];
    const toState = transition.to;

    if (!fromStates.length || !fromStates.every((from) => typeof from === 'string' && from.length > 0) || typeof toState !== 'string' || toState.length === 0) {
      lines.push('  %% skipped transition with missing from/to');
      continue;
    }

    for (const fromState of fromStates) {
      declaredStates.add(fromState);
      declaredStates.add(toState);
      const label = typeof transition.on === 'string' && transition.on.length > 0 ? `: ${transition.on}` : '';
      lines.push(`  ${fromState} --> ${toState}${label}`);
    }
  }

  return lines.join('\n');
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
