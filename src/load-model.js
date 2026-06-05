import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { emptyModelIndex, MODEL_SCOPES, normalizeModelIdentity, YAML_EXTENSIONS } from './model.js';

export { emptyModelIndex, MODEL_SCOPES, modelIndexFromEntries, normalizeModelIdentity, YAML_EXTENSIONS } from './model.js';

export async function loadModel(modelDir) {
  const root = path.resolve(modelDir);
  const index = emptyModelIndex();

  await Promise.all(MODEL_SCOPES.map(async (scope) => {
    const scopeDir = path.join(root, scope);
    if (!(await existsDirectory(scopeDir))) {
      return;
    }

    for await (const file of walkYamlFiles(scopeDir)) {
      const identity = normalizeModelIdentity(path.relative(scopeDir, file));
      const source = await readFile(file, 'utf8');
      const document = YAML.parse(source) ?? {};
      index[scope].set(identity, {
        scope,
        identity,
        file,
        document
      });
    }
  }));

  return index;
}

async function existsDirectory(file) {
  try {
    return (await stat(file)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function* walkYamlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'generated') {
      continue;
    }

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walkYamlFiles(fullPath);
      continue;
    }

    if (entry.isFile() && YAML_EXTENSIONS.has(path.extname(entry.name))) {
      yield fullPath;
    }
  }
}
