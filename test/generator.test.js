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
