# @behavioml/generator

Experimental BehavioML generator for producing human-readable Mermaid diagrams from BehavioML model directories.

This project is intentionally small. It is not a renderer, editor, schema validator, language server, or full documentation generator. Its purpose is to stress-test whether current BehavioML model relationships can produce useful views for humans.

## Project status

`@behavioml/generator` is experimental. Generated diagrams are derived artifacts and are not a source of truth.

The generator does not validate models. Run @behavioml/validator first.

## Relationship to BehavioML/specifications

The [`BehavioML/specifications`](https://github.com/BehavioML/specifications) repository contains example model directories such as:

- `examples/quic/model`
- `examples/oauth-authorization-code/model`

This generator reads those model directories and emits Mermaid text for selected relationship views.

## Relationship to BehavioML/validator

The [`BehavioML/validator`](https://github.com/BehavioML/validator) package validates BehavioML models and provides:

```bash
behavioml-validate <model-dir>
```

Use the validator before generating diagrams:

```bash
behavioml-validate examples/oauth-authorization-code/model
behavioml-generate examples/oauth-authorization-code/model --format mermaid --view workflow-capabilities
```

## Installation

Install as a project dependency:

```bash
npm install @behavioml/generator
```

Or run with `npx`:

```bash
npx @behavioml/generator examples/oauth-authorization-code/model --format mermaid --view workflow-capabilities
```

For local development:

```bash
npm install
npm test
```

## CLI usage

```bash
behavioml-generate <model-dir> --format mermaid --view <view> [--output <file>]
```

Required options:

- `--format mermaid` — Mermaid text is the only supported output format.
- `--view <view>` — one of the supported views below.

Optional options:

- `--output <file>` — write Mermaid text to a file instead of stdout.
- `--help` / `-h` — show usage and examples.

Exit codes:

- `0` success
- `1` generation/runtime error
- `2` CLI usage error

## Supported Mermaid views

### `workflow-capabilities`

Shows `Workflow -> Capability` relationships from workflow `steps`.

```bash
behavioml-generate examples/oauth-authorization-code/model --format mermaid --view workflow-capabilities
```

Missing capability references are rendered as placeholder nodes instead of failing generation.

### `state-machines`

Shows BehavioML state machines as Mermaid `stateDiagram-v2` diagrams.

```bash
behavioml-generate examples/oauth-authorization-code/model --format mermaid --view state-machines --output oauth-states.mmd
```

Array-valued transition `from` values are expanded into multiple Mermaid edges. Declared states without transitions are emitted as state declarations.

### `capability-events`

Shows `Capability -> Event` relationships from capability `events`.

```bash
behavioml-generate examples/oauth-authorization-code/model --format mermaid --view capability-events
```

Missing event references are rendered as placeholder nodes instead of failing generation.

## Model loading

The generator loads `.yaml` and `.yml` files from these known scopes:

- `workflows`
- `roles`
- `capabilities`
- `interfaces`
- `components`
- `modules`
- `events`
- `entities`
- `state-machines`
- `decisions`

The `generated` directory is ignored. Identity is derived from the path inside each scope without the YAML extension. For example:

```text
model/capabilities/oauth/issue_access_token.yaml
```

becomes:

```text
capabilities: oauth/issue_access_token
```

## Examples

Validate first, then generate Mermaid:

```bash
behavioml-validate examples/oauth-authorization-code/model
behavioml-generate examples/oauth-authorization-code/model --format mermaid --view workflow-capabilities
behavioml-generate examples/oauth-authorization-code/model --format mermaid --view state-machines --output oauth-states.mmd
```

Generated output is plain Mermaid text and can be pasted into any Mermaid-compatible viewer.

## Limitations

This MVP intentionally does not implement:

- model validation
- SVG/PNG rendering
- Mermaid CLI integration
- HTML documentation generation
- graph layout customization
- JSON output
- watch mode
- language server support
- schema validation
- model mutation
- generated artifact writing back into specifications repositories
- publishing automation
