import { generateCapabilityEvents } from './views/capability-events.js';
import { generateStateMachines } from './views/state-machines.js';
import { generateWorkflowCapabilities } from './views/workflow-capabilities.js';

export const SUPPORTED_VIEWS = new Set([
  'workflow-capabilities',
  'state-machines',
  'capability-events'
]);

export function generateMermaid(model, view) {
  switch (view) {
    case 'workflow-capabilities':
      return generateWorkflowCapabilities(model);
    case 'state-machines':
      return generateStateMachines(model);
    case 'capability-events':
      return generateCapabilityEvents(model);
    default:
      throw new Error(`Unsupported view: ${view}`);
  }
}
