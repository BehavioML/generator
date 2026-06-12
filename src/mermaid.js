import { generateCapabilityEvents } from './views/capability-events.js';
import { generateEntityStateMachines } from './views/entity-state-machines.js';
import { generateSemanticAreaWorkflows } from './views/semantic-area-workflows.js';
import { generateStateMachines } from './views/state-machines.js';
import { generateWorkflowCapabilities } from './views/workflow-capabilities.js';
import { generateWorkflowSequence } from './views/workflow-sequence.js';

export const SUPPORTED_VIEWS = new Set([
  'workflow-capabilities',
  'workflow-sequence',
  'state-machines',
  'capability-events',
  'entity-state-machines',
  'semantic-area-workflows'
]);

export function generateMermaid(model, view, options = {}) {
  switch (view) {
    case 'workflow-capabilities':
      return generateWorkflowCapabilities(model);
    case 'workflow-sequence':
      return generateWorkflowSequence(model, options.workflow, { expandUses: options.expandUses, workflowComposition: options.workflowComposition });
    case 'state-machines':
      return generateStateMachines(model);
    case 'capability-events':
      return generateCapabilityEvents(model);
    case 'entity-state-machines':
      return generateEntityStateMachines(model);
    case 'semantic-area-workflows':
      return generateSemanticAreaWorkflows(model, options.semanticArea);
    default:
      throw new Error(`Unsupported view: ${view}`);
  }
}
