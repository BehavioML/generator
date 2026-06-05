import YAML from 'yaml';
import { generateMermaid, SUPPORTED_VIEWS } from './mermaid.js';
import { MODEL_SCOPES, modelIndexFromEntries, normalizeModelIdentity } from './model.js';

/**
 * @typedef {object} GeneratorWorkspaceFile
 * @property {string} path Path-like workspace identity for the file.
 * @property {string} content Already-loaded UTF-8 file content.
 *
 * @typedef {'mermaid' | 'markdown' | 'json' | 'text'} GeneratorArtifactFormat
 *
 * @typedef {object} GeneratorDiagnostic
 * @property {'error' | 'warning' | 'info'} severity Diagnostic severity.
 * @property {string} message Human-readable diagnostic message.
 *
 * @typedef {object} GeneratorArtifact
 * @property {string} kind Generated artifact kind, usually a supported generator view.
 * @property {GeneratorArtifactFormat} format Artifact content format.
 * @property {string=} path Suggested generated artifact path.
 * @property {string=} title Human-readable artifact title.
 * @property {string} content Generated artifact content.
 * @property {{ kind: string, id: string }=} sourceEntity Source BehavioML entity when an artifact maps to one entity.
 * @property {readonly GeneratorDiagnostic[]=} diagnostics Non-fatal diagnostics for this artifact.
 *
 * @typedef {object} GenerateWorkspaceArtifactsOptions
 * @property {readonly string[]=} artifacts Artifact kinds to generate. Use a view name or `workflow-sequence:<workflow-id>`.
 * @property {readonly GeneratorArtifactFormat[]=} formats Requested output formats. Mermaid is currently the only generatable format.
 * @property {string=} workflow Workflow identity used when generating a single workflow-sequence artifact.
 * @property {'one-level' | 'recursive' | 'none' | boolean=} expandUses Workflow sequence Capability.uses expansion mode.
 */

export const GENERATOR_ARTIFACT_FORMATS = new Set(['mermaid', 'markdown', 'json', 'text']);
export const DEFAULT_GENERATOR_ARTIFACTS = Object.freeze([
  'workflow-sequence',
  'state-machines',
  'workflow-capabilities',
  'capability-events',
  'entity-state-machines'
]);

/**
 * Generate structured artifacts from already-loaded BehavioML workspace files.
 * This SDK entrypoint performs no filesystem IO.
 *
 * @param {readonly GeneratorWorkspaceFile[]} files
 * @param {GenerateWorkspaceArtifactsOptions=} options
 * @returns {Promise<readonly GeneratorArtifact[]>}
 */
export async function generateWorkspaceArtifacts(files, options = {}) {
  const model = loadWorkspaceModel(files);
  return generateModelArtifacts(model, options);
}

/**
 * Generate structured artifacts from an already-loaded generator model index.
 *
 * @param {Record<string, Map<string, object>>} model
 * @param {GenerateWorkspaceArtifactsOptions=} options
 * @returns {readonly GeneratorArtifact[]}
 */
export function generateModelArtifacts(model, options = {}) {
  const formats = options.formats ? [...options.formats] : ['mermaid'];
  const unsupportedFormat = formats.find((format) => format !== 'mermaid');
  if (unsupportedFormat) {
    return [diagnosticArtifact({
      message: `Unsupported artifact format: ${unsupportedFormat}`,
      path: undefined
    })];
  }

  const requestedArtifacts = options.artifacts ? [...options.artifacts] : DEFAULT_GENERATOR_ARTIFACTS;
  return requestedArtifacts.flatMap((artifact) => generateRequestedMermaidArtifacts(model, artifact, options));
}

/**
 * Parse already-loaded workspace files into the generator's in-memory model index.
 *
 * @param {readonly GeneratorWorkspaceFile[]} files
 * @returns {Record<string, Map<string, object>>}
 */
export function loadWorkspaceModel(files) {
  const entries = [];

  for (const file of files ?? []) {
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
      continue;
    }

    const parsed = parseWorkspacePath(file.path);
    if (!parsed) {
      continue;
    }

    const document = YAML.parse(file.content) ?? {};
    entries.push({
      scope: parsed.scope,
      identity: parsed.identity,
      file: file.path,
      document
    });
  }

  return modelIndexFromEntries(entries);
}

function generateRequestedMermaidArtifacts(model, artifact, options) {
  if (artifact === 'workflow-sequence') {
    return generateWorkflowSequenceArtifacts(model, options);
  }

  const workflowPrefix = 'workflow-sequence:';
  if (artifact.startsWith(workflowPrefix)) {
    const workflow = artifact.slice(workflowPrefix.length);
    return [generateSingleArtifact(model, 'workflow-sequence', { workflow, expandUses: options.expandUses })];
  }

  if (!SUPPORTED_VIEWS.has(artifact)) {
    return [diagnosticArtifact({
      message: `Unsupported artifact: ${artifact}`,
      path: undefined
    })];
  }

  return [generateSingleArtifact(model, artifact, options)];
}

function generateWorkflowSequenceArtifacts(model, options) {
  if (options.workflow) {
    return [generateSingleArtifact(model, 'workflow-sequence', {
      workflow: options.workflow,
      expandUses: options.expandUses
    })];
  }

  return [...model.workflows.keys()].map((workflow) => generateSingleArtifact(model, 'workflow-sequence', {
    workflow,
    expandUses: options.expandUses
  }));
}

function generateSingleArtifact(model, kind, options) {
  try {
    const content = generateMermaid(model, kind, options);
    const sourceEntity = sourceEntityFor(kind, options);
    return {
      kind,
      format: 'mermaid',
      path: artifactPath(kind, options),
      title: artifactTitle(kind, options),
      content,
      ...(sourceEntity ? { sourceEntity } : {})
    };
  } catch (error) {
    const sourceEntity = sourceEntityFor(kind, options);
    return diagnosticArtifact({
      kind,
      path: artifactPath(kind, options),
      title: artifactTitle(kind, options),
      message: error instanceof Error ? error.message : String(error),
      sourceEntity,
      format: 'mermaid'
    });
  }
}

function diagnosticArtifact({ kind = 'diagnostic', path, title, message, sourceEntity, format = 'text' }) {
  return {
    kind,
    format,
    ...(path ? { path } : {}),
    ...(title ? { title } : {}),
    content: '',
    ...(sourceEntity ? { sourceEntity } : {}),
    diagnostics: [{ severity: 'error', message }]
  };
}

function artifactPath(kind, options) {
  if (kind === 'workflow-sequence' && options.workflow) {
    return `generated/workflows/${options.workflow}.mmd`;
  }

  return `generated/${kind}.mmd`;
}

function artifactTitle(kind, options) {
  if (kind === 'workflow-sequence' && options.workflow) {
    return `Workflow sequence: ${options.workflow}`;
  }

  return kind;
}

function sourceEntityFor(kind, options) {
  if (kind === 'workflow-sequence' && options.workflow) {
    return { kind: 'workflow', id: options.workflow };
  }

  return undefined;
}

function parseWorkspacePath(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const segments = normalized.split('/').filter(Boolean);
  const scopeIndex = segments.findIndex((segment) => MODEL_SCOPES.includes(segment));

  if (scopeIndex === -1 || segments[scopeIndex + 1] === 'generated') {
    return undefined;
  }

  const scope = segments[scopeIndex];
  const relativeFile = segments.slice(scopeIndex + 1).join('/');
  const identity = normalizeModelIdentity(relativeFile);
  if (!identity) {
    return undefined;
  }

  return { scope, identity };
}
