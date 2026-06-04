import { generateCapabilityEvents } from './views/capability-events.js';
import { generateEntityStateMachines } from './views/entity-state-machines.js';
import { generateStateMachines } from './views/state-machines.js';
import { generateWorkflowCapabilities } from './views/workflow-capabilities.js';

export const SUPPORTED_VIEWS = new Set([
  'workflow-capabilities',
  'state-machines',
  'capability-events',
  'entity-state-machines'
]);

export function generateMermaid(model, view) {
  switch (view) {
    case 'workflow-capabilities':
      return generateWorkflowCapabilities(model);
    case 'state-machines':
      return generateStateMachines(model);
    case 'capability-events':
      return generateCapabilityEvents(model);
    case 'entity-state-machines':
      return generateEntityStateMachines(model);
    default:
      throw new Error(`Unsupported view: ${view}`);
  }
}
