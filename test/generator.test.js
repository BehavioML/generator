import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { generateMermaid, loadModel } from '../src/index.js';

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

test('CLI exits 1 when --workflow is missing for workflow-sequence', () => {
  const result = spawnSync(process.execPath, [cli, fixtureModel, '--format', 'mermaid', '--view', 'workflow-sequence'], {
    encoding: 'utf8'
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /workflow-sequence view requires --workflow <workflow>/);
});

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
