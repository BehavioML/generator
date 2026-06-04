import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateMermaid, loadModel, SUPPORTED_VIEWS } from './index.js';

export const EXIT_SUCCESS = 0;
export const EXIT_GENERATION_ERROR = 1;
export const EXIT_USAGE_ERROR = 2;

export async function runCli(argv, io = process) {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    io.stdout.write(helpText());
    return EXIT_SUCCESS;
  }

  if (parsed.error) {
    io.stderr.write(`${parsed.error}\n\n${usageText()}\n`);
    return EXIT_USAGE_ERROR;
  }

  if (parsed.format !== 'mermaid') {
    io.stderr.write(`Unsupported format: ${parsed.format}\n\n${usageText()}\n`);
    return EXIT_USAGE_ERROR;
  }

  if (!SUPPORTED_VIEWS.has(parsed.view)) {
    io.stderr.write(`Unsupported view: ${parsed.view}\n\n${usageText()}\n`);
    return EXIT_USAGE_ERROR;
  }

  try {
    const model = await loadModel(parsed.modelDir);
    const output = generateMermaid(model, parsed.view, { workflow: parsed.workflow });

    if (parsed.output) {
      await mkdir(path.dirname(path.resolve(parsed.output)), { recursive: true });
      await writeFile(parsed.output, output, 'utf8');
    } else {
      io.stdout.write(output);
    }

    return EXIT_SUCCESS;
  } catch (error) {
    io.stderr.write(`Generation error: ${error instanceof Error ? error.message : String(error)}\n`);
    return EXIT_GENERATION_ERROR;
  }
}

export function parseArgs(argv) {
  const args = [...argv];
  const result = {
    modelDir: undefined,
    format: undefined,
    view: undefined,
    output: undefined,
    workflow: undefined,
    help: false,
    error: undefined
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }

    if (arg === '--format') {
      result.format = readOptionValue(args, arg, result);
      if (result.error) {
        return result;
      }
      continue;
    }

    if (arg === '--view') {
      result.view = readOptionValue(args, arg, result);
      if (result.error) {
        return result;
      }
      continue;
    }

    if (arg === '--output') {
      result.output = readOptionValue(args, arg, result);
      if (result.error) {
        return result;
      }
      continue;
    }

    if (arg === '--workflow') {
      result.workflow = readOptionValue(args, arg, result);
      if (result.error) {
        return result;
      }
      continue;
    }

    if (arg?.startsWith('--')) {
      result.error = `Unknown option: ${arg}`;
      return result;
    }

    if (!result.modelDir) {
      result.modelDir = arg;
      continue;
    }

    result.error = `Unexpected argument: ${arg}`;
    return result;
  }

  if (result.help) {
    return result;
  }

  if (!result.modelDir) {
    result.error = 'Missing model directory.';
  } else if (!result.format) {
    result.error = 'Missing required option: --format mermaid';
  } else if (!result.view) {
    result.error = 'Missing required option: --view <view>';
  }

  return result;
}

function readOptionValue(args, option, result) {
  const value = args.shift();
  if (!value || value.startsWith('--')) {
    result.error = `Missing value for option: ${option}`;
    if (value) {
      args.unshift(value);
    }
    return undefined;
  }

  return value;
}

function usageText() {
  return 'Usage: behavioml-generate <model-dir> --format mermaid --view <view> [--workflow <workflow>] [--output <file>]';
}

function helpText() {
  return `${usageText()}

Generate experimental Mermaid diagrams from a BehavioML model directory.

Required options:
  --format mermaid                         Output format. Mermaid is the only supported format.
  --view <view>                            View to generate.

Supported views:
  state-machines                           Documentation-grade state diagrams for state machines.
  workflow-sequence                        Documentation-grade sequence diagram for one workflow.
  workflow-capabilities                    Inspection/debug flowchart of workflows to referenced capabilities.
  capability-events                        Inspection/debug flowchart of capabilities to declared events.
  entity-state-machines                    Inspection/debug flowchart of entities to owned state machines.

Optional:
  --workflow <workflow>                    Workflow identity for workflow-sequence, relative to workflows/ without .yaml.
  --output <file>                          Write Mermaid text to a file instead of stdout.
  --help, -h                               Show this help message.

Examples:
  behavioml-generate examples/oauth-authorization-code/model --format mermaid --view workflow-sequence --workflow client/start_authorization
  behavioml-generate examples/oauth-authorization-code/model --format mermaid --view state-machines --output oauth-states.mmd
  npx @behavioml/generator examples/quic/model --format mermaid --view capability-events
  behavioml-generate examples/oauth-authorization-code/model --format mermaid --view entity-state-machines
`;
}
