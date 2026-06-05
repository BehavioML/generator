import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { generateMermaid, generateWorkspaceArtifacts, loadModel, loadWorkspaceModel } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureModel = path.join(__dirname, 'fixtures', 'minimal-model', 'model');
const cli = path.join(__dirname, '..', 'bin', 'behavioml-generate.js');

test('workflow-capabilities output contains workflow nodes', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'workflow-capabilities');

  assert.match(output, /W_client_start\["workflow: client_start"\]/);
  assert.match(output, /W_empty\["workflow: empty"\]/);
});

test('workflow-capabilities output contains workflow to capability edges', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'workflow-capabilities');

  assert.match(output, /W_client_start --> C_oauth_build_authorization_request/);
  assert.match(output, /W_client_start --> C_oauth_redirect_to_authorization_server/);
});

test('state-machines expands array-valued from into multiple edges', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'state-machines');

  assert.match(output, /requested --> rejected: authorization_code_rejected/);
  assert.match(output, /issued --> rejected: authorization_code_rejected/);
});

test('state-machines includes declared unused states', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'state-machines');

  assert.match(output, /state expired/);
});

test('capability-events output contains capability to event edges', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'capability-events');

  assert.match(output, /C_oauth_build_authorization_request --> E_authorization_requested/);
  assert.match(output, /C_oauth_redirect_to_authorization_server --> E_authorization_redirected/);
});

test('entity-state-machines output contains entity nodes', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'entity-state-machines');

  assert.match(output, /E_authorization_code\["entity: authorization_code"\]/);
});

test('entity-state-machines output contains state-machine nodes', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'entity-state-machines');

  assert.match(output, /SM_oauth_authorization_code\["state-machine: oauth\/authorization_code"\]/);
  assert.match(output, /SM_lifecycle\["state-machine: lifecycle"\]/);
});

test('entity-state-machines output contains entity to state-machine edges', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'entity-state-machines');

  assert.match(output, /E_authorization_code --> SM_oauth_authorization_code/);
});

test('entity-state-machines output contains entities without state machines as isolated nodes', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'entity-state-machines');

  assert.match(output, /E_client\["entity: client"\]/);
  assert.doesNotMatch(output, /E_client -->/);
});

test('entity-state-machines output contains missing entity placeholders', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'entity-state-machines');

  assert.match(output, /E_missing_entity\["missing entity: missing\/entity"\]/);
  assert.match(output, /E_missing_entity --> SM_orphaned/);
});

test('CLI exits 2 for unknown view', () => {
  const result = spawnSync(process.execPath, [cli, fixtureModel, '--format', 'mermaid', '--view', 'unknown'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unsupported view: unknown/);
});

test('CLI writes to --output', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'behavioml-generator-'));
  const outputFile = path.join(directory, 'diagram.mmd');

  try {
    const result = spawnSync(process.execPath, [cli, fixtureModel, '--format', 'mermaid', '--view', 'workflow-capabilities', '--output', outputFile], {
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    const output = await readFile(outputFile, 'utf8');
    assert.match(output, /flowchart LR/);
    assert.match(output, /W_client_start --> C_oauth_build_authorization_request/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('SDK generates a workflow sequence artifact from already-loaded workspace files', async () => {
  const files = await fixtureWorkspaceFiles();
  const artifacts = await generateWorkspaceArtifacts(files, {
    artifacts: ['workflow-sequence:client/start_authorization'],
    formats: ['mermaid']
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].kind, 'workflow-sequence');
  assert.equal(artifacts[0].format, 'mermaid');
  assert.equal(artifacts[0].path, 'generated/workflows/client/start_authorization.mmd');
  assert.deepEqual(artifacts[0].sourceEntity, { kind: 'workflow', id: 'client/start_authorization' });
  assert.match(artifacts[0].content, /sequenceDiagram/);
  assert.match(artifacts[0].content, /client->>user_agent: Redirect to authorization server/);
  assert.equal(artifacts[0].diagnostics, undefined);
});

test('SDK workflow sequence artifacts include stable source-map metadata', async () => {
  const files = await fixtureWorkspaceFiles();
  const [artifact] = await generateWorkspaceArtifacts(files, {
    artifacts: ['workflow-sequence:client/start_authorization'],
    formats: ['mermaid']
  });

  assert.ok(Array.isArray(artifact.sourceMap));
  assert.ok(artifact.sourceMap.length > 0);

  const workflowEntry = findSourceMapEntry(artifact.sourceMap, {
    role: 'entity',
    scope: 'workflows',
    identity: 'client/start_authorization'
  });
  assert.equal(workflowEntry.diagramId, 'workflow-client-start-authorization');
  assert.equal(workflowEntry.label, 'Start authorization');

  const participantEntry = findSourceMapEntry(artifact.sourceMap, {
    role: 'participant',
    scope: 'roles',
    identity: 'authorization_server'
  });
  assert.equal(participantEntry.diagramId, 'participant-authorization-server');
  assert.equal(participantEntry.label, 'Authorization Server');

  const capabilityEntry = findSourceMapEntry(artifact.sourceMap, {
    role: 'target',
    scope: 'capabilities',
    identity: 'oauth/build_authorization_request',
    fieldPath: 'steps[0].capability'
  });
  assert.equal(capabilityEntry.diagramId, 'workflow-step-capability-client-start-authorization-0-oauth-build-authorization-request');
  assert.equal(capabilityEntry.label, 'Build authorization request');

  assert.deepEqual(findSourceMapEntry(artifact.sourceMap, {
    role: 'source',
    scope: 'roles',
    identity: 'client',
    fieldPath: 'steps[0].from'
  }).entity, { scope: 'roles', identity: 'client' });

  assert.deepEqual(findSourceMapEntry(artifact.sourceMap, {
    role: 'target',
    scope: 'roles',
    identity: 'user_agent',
    fieldPath: 'steps[1].to'
  }).entity, { scope: 'roles', identity: 'user_agent' });
});

test('SDK source-map diagram ids are stable and safe', async () => {
  const files = await fixtureWorkspaceFiles();
  const [firstArtifact] = await generateWorkspaceArtifacts(files, {
    artifacts: ['workflow-sequence:client/start_authorization'],
    formats: ['mermaid']
  });
  const [secondArtifact] = await generateWorkspaceArtifacts(files, {
    artifacts: ['workflow-sequence:client/start_authorization'],
    formats: ['mermaid']
  });

  assert.deepEqual(
    firstArtifact.sourceMap.map((entry) => entry.diagramId),
    secondArtifact.sourceMap.map((entry) => entry.diagramId)
  );

  for (const entry of firstArtifact.sourceMap) {
    assert.match(entry.diagramId, /^[A-Za-z][A-Za-z0-9-]*$/);
  }
});

test('SDK state-machine artifacts include state, transition, and event source-map metadata', async () => {
  const files = await fixtureWorkspaceFiles();
  const [artifact] = await generateWorkspaceArtifacts(files, {
    artifacts: ['state-machines'],
    formats: ['mermaid']
  });

  assert.ok(Array.isArray(artifact.sourceMap));
  assert.deepEqual(findSourceMapEntry(artifact.sourceMap, {
    role: 'entity',
    scope: 'state-machines',
    identity: 'lifecycle'
  }).entity, { scope: 'state-machines', identity: 'lifecycle' });
  assert.equal(findSourceMapEntry(artifact.sourceMap, {
    role: 'state',
    scope: 'state-machines',
    identity: 'lifecycle',
    fieldPath: 'states[0]'
  }).diagramId, 'state-lifecycle-requested');
  assert.equal(findSourceMapEntry(artifact.sourceMap, {
    role: 'transition',
    scope: 'state-machines',
    identity: 'lifecycle',
    fieldPath: 'transitions[1].from[0]'
  }).label, 'requested → rejected: authorization_code_rejected');
  assert.equal(findSourceMapEntry(artifact.sourceMap, {
    role: 'edge',
    scope: 'events',
    identity: 'authorization_code_rejected',
    fieldPath: 'transitions[1].on'
  }).diagramId, 'transition-event-lifecycle-1-authorization-code-rejected');
});

test('SDK workspace model loading ignores generated files and derives scoped identities', async () => {
  const model = loadWorkspaceModel([
    { path: 'model/workflows/client/start_authorization.yaml', content: 'steps: []' },
    { path: 'model/workflows/generated/ignored.yaml', content: 'steps: []' },
    { path: 'model/capabilities/oauth/build_authorization_request.yml', content: 'name: Build authorization request' }
  ]);

  assert.equal(model.workflows.has('client/start_authorization'), true);
  assert.equal(model.workflows.has('generated/ignored'), false);
  assert.equal(model.capabilities.has('oauth/build_authorization_request'), true);
});

test('SDK returns artifact diagnostics instead of throwing for generation errors', async () => {
  const artifacts = await generateWorkspaceArtifacts([
    { path: 'model/workflows/legacy.yaml', content: `steps:
  - oauth/build_authorization_request
` }
  ], {
    artifacts: ['workflow-sequence:legacy'],
    formats: ['mermaid']
  });

  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].kind, 'workflow-sequence');
  assert.equal(artifacts[0].content, '');
  assert.match(artifacts[0].diagnostics[0].message, /workflow-sequence view requires object workflow steps/);
});

test('workflow-sequence generates participants in workflow role order', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'workflow-sequence', { workflow: 'client/start_authorization' });

  assert.match(output, /sequenceDiagram/);
  assert.match(output, /participant client as Client\n  participant user_agent as User Agent\n  participant authorization_server as Authorization Server/);
});

test('workflow-sequence generates message for from and to', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'workflow-sequence', { workflow: 'client/start_authorization' });

  assert.match(output, /client->>user_agent: Redirect to authorization server/);
});

test('workflow-sequence generates note for from only', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'workflow-sequence', { workflow: 'client/start_authorization' });

  assert.match(output, /Note over client: Build authorization request/);
});

test('workflow-sequence falls back to humanized capability basename when label is missing', async () => {
  const model = await loadModel(fixtureModel);
  const output = generateMermaid(model, 'workflow-sequence', { workflow: 'client/start_authorization' });

  assert.match(output, /user_agent->>authorization_server: Receive Authorization Request/);
});

test('workflow-sequence fails on legacy string step', async () => {
  const model = await loadModel(fixtureModel);
  const workflow = workflowVariant(model, { steps: ['oauth/build_authorization_request'] });
  model.workflows.set(workflow.identity, workflow);

  assert.throws(
    () => generateMermaid(model, 'workflow-sequence', { workflow: workflow.identity }),
    /workflow-sequence view requires object workflow steps; found legacy string step at workflows\/client\/start_authorization.yaml steps\[0\]/
  );
});

test('workflow-sequence fails on missing from', async () => {
  const model = await loadModel(fixtureModel);
  const workflow = workflowVariant(model, { steps: [{ to: 'user_agent', label: 'Missing from' }] });
  model.workflows.set(workflow.identity, workflow);

  assert.throws(
    () => generateMermaid(model, 'workflow-sequence', { workflow: workflow.identity }),
    /workflow-sequence view requires from at workflows\/client\/start_authorization.yaml steps\[0\]/
  );
});

test('workflow-sequence fails on invalid from role', async () => {
  const model = await loadModel(fixtureModel);
  const workflow = workflowVariant(model, { steps: [{ from: 'unknown', label: 'Invalid from' }] });
  model.workflows.set(workflow.identity, workflow);

  assert.throws(
    () => generateMermaid(model, 'workflow-sequence', { workflow: workflow.identity }),
    /workflow-sequence step uses undeclared from role "unknown" at workflows\/client\/start_authorization.yaml steps\[0\]/
  );
});

test('workflow-sequence fails on invalid to role', async () => {
  const model = await loadModel(fixtureModel);
  const workflow = workflowVariant(model, { steps: [{ from: 'client', to: 'unknown', label: 'Invalid to' }] });
  model.workflows.set(workflow.identity, workflow);

  assert.throws(
    () => generateMermaid(model, 'workflow-sequence', { workflow: workflow.identity }),
    /workflow-sequence step uses undeclared to role "unknown" at workflows\/client\/start_authorization.yaml steps\[0\]/
  );
});

test('workflow-sequence fails on unsupported at', async () => {
  const model = await loadModel(fixtureModel);
  const workflow = workflowVariant(model, { steps: [{ at: 'client', label: 'Unsupported at' }] });
  model.workflows.set(workflow.identity, workflow);

  assert.throws(
    () => generateMermaid(model, 'workflow-sequence', { workflow: workflow.identity }),
    /workflow-sequence does not support at; use from without to for local steps/
  );
});

test('workflow-sequence expands direct capability uses as a note attached to the workflow step recipient', async () => {
  const model = await loadModel(fixtureModel);
  addCapability(model, 'oauth/receive_authorization_request', {
    name: 'Receive authorization request',
    uses: [
      'oauth/validate_authorization_request',
      'oauth/create_authorization_code'
    ]
  });
  addCapability(model, 'oauth/validate_authorization_request', { name: 'Validate Authorization Request' });
  addCapability(model, 'oauth/create_authorization_code', { name: 'Create Authorization Code' });

  const output = generateMermaid(model, 'workflow-sequence', {
    workflow: 'client/start_authorization',
    expandUses: 'one-level'
  });

  assert.match(output, /user_agent->>authorization_server: Receive Authorization Request/);
  assert.match(output, /Note over authorization_server: 1\. Validate Authorization Request<br\/>2\. Create Authorization Code/);
});

test('workflow-sequence preserves declared Capability.uses ordering', async () => {
  const model = await loadModel(fixtureModel);
  addCapability(model, 'oauth/receive_authorization_request', {
    uses: [
      'oauth/first_internal_step',
      'oauth/second_internal_step',
      'oauth/third_internal_step'
    ]
  });
  addCapability(model, 'oauth/first_internal_step', { name: 'First Internal Step' });
  addCapability(model, 'oauth/second_internal_step', { name: 'Second Internal Step' });
  addCapability(model, 'oauth/third_internal_step', { name: 'Third Internal Step' });

  const output = generateMermaid(model, 'workflow-sequence', {
    workflow: 'client/start_authorization',
    expandUses: true
  });

  assert.ok(output.indexOf('1. First Internal Step') < output.indexOf('2. Second Internal Step'));
  assert.ok(output.indexOf('2. Second Internal Step') < output.indexOf('3. Third Internal Step'));
});

test('workflow-sequence recursively expands transitive Capability.uses', async () => {
  const model = await loadModel(fixtureModel);
  addCapability(model, 'oauth/receive_authorization_request', {
    uses: ['oauth/validate_authorization_request']
  });
  addCapability(model, 'oauth/validate_authorization_request', {
    name: 'Validate Authorization Request',
    uses: ['oauth/check_redirect_uri']
  });
  addCapability(model, 'oauth/check_redirect_uri', { name: 'Check Redirect URI' });

  const output = generateMermaid(model, 'workflow-sequence', {
    workflow: 'client/start_authorization',
    expandUses: 'recursive'
  });

  assert.match(output, /Note over authorization_server: 1\. Validate Authorization Request<br\/>1\.1\. Check Redirect URI/);
});

test('workflow-sequence recursive uses expansion detects cycles without infinite recursion', async () => {
  const model = await loadModel(fixtureModel);
  addCapability(model, 'oauth/receive_authorization_request', {
    uses: ['oauth/validate_authorization_request']
  });
  addCapability(model, 'oauth/validate_authorization_request', {
    name: 'Validate Authorization Request',
    uses: ['oauth/check_redirect_uri']
  });
  addCapability(model, 'oauth/check_redirect_uri', {
    name: 'Check Redirect URI',
    uses: ['oauth/validate_authorization_request']
  });

  const output = generateMermaid(model, 'workflow-sequence', {
    workflow: 'client/start_authorization',
    expandUses: 'recursive'
  });

  assert.match(output, /1\.1\.1\. Validate Authorization Request \(cycle detected\)/);
});

test('workflow-sequence keeps interaction workflow steps as messages when uses are expanded', async () => {
  const model = await loadModel(fixtureModel);
  addCapability(model, 'oauth/redirect_to_authorization_server', {
    uses: ['oauth/build_authorization_uri']
  });
  addCapability(model, 'oauth/build_authorization_uri', { name: 'Build Authorization URI' });

  const output = generateMermaid(model, 'workflow-sequence', {
    workflow: 'client/start_authorization',
    expandUses: 'one-level'
  });

  assert.match(output, /client->>user_agent: Redirect to authorization server/);
});

test('workflow-sequence does not render Capability.uses as independent messages', async () => {
  const model = await loadModel(fixtureModel);
  addCapability(model, 'oauth/redirect_to_authorization_server', {
    uses: ['oauth/build_authorization_uri']
  });
  addCapability(model, 'oauth/build_authorization_uri', { name: 'Build Authorization URI' });

  const output = generateMermaid(model, 'workflow-sequence', {
    workflow: 'client/start_authorization',
    expandUses: 'one-level'
  });

  assert.match(output, /Note over user_agent: 1\. Build Authorization URI/);
  assert.doesNotMatch(output, /->>.*Build Authorization URI/);
});

test('workflow-sequence default output does not expand Capability.uses', async () => {
  const model = await loadModel(fixtureModel);
  addCapability(model, 'oauth/redirect_to_authorization_server', {
    uses: ['oauth/build_authorization_uri']
  });
  addCapability(model, 'oauth/build_authorization_uri', { name: 'Build Authorization URI' });

  const output = generateMermaid(model, 'workflow-sequence', { workflow: 'client/start_authorization' });

  assert.match(output, /client->>user_agent: Redirect to authorization server/);
  assert.doesNotMatch(output, /Build Authorization URI/);
});

test('CLI exits 1 when --workflow is missing for workflow-sequence', () => {
  const result = spawnSync(process.execPath, [cli, fixtureModel, '--format', 'mermaid', '--view', 'workflow-sequence'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /workflow-sequence view requires --workflow <workflow>/);
});

function findSourceMapEntry(sourceMap, expected) {
  const entry = sourceMap.find((candidate) => Object.entries(expected).every(([key, value]) => {
    if (key === 'scope') {
      return candidate.entity?.scope === value;
    }

    if (key === 'identity') {
      return candidate.entity?.identity === value;
    }

    return candidate[key] === value;
  }));

  assert.ok(entry, `Missing source-map entry: ${JSON.stringify(expected)}`);
  return entry;
}

async function fixtureWorkspaceFiles(directory = fixtureModel, prefix = 'model') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const workspacePath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await fixtureWorkspaceFiles(fullPath, workspacePath));
      continue;
    }

    if (entry.isFile()) {
      files.push({ path: workspacePath, content: await readFile(fullPath, 'utf8') });
    }
  }

  return files;
}

function addCapability(model, identity, document) {
  model.capabilities.set(identity, {
    scope: 'capabilities',
    identity,
    file: `${fixtureModel}/capabilities/${identity}.yaml`,
    document
  });
}

function workflowVariant(model, documentPatch) {
  const base = model.workflows.get('client/start_authorization');
  return {
    ...base,
    document: {
      ...structuredClone(base.document),
      ...documentPatch
    }
  };
}
