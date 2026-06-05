export const MODEL_SCOPES = [
  'workflows',
  'roles',
  'capabilities',
  'interfaces',
  'components',
  'modules',
  'events',
  'entities',
  'state-machines',
  'decisions'
];

export const YAML_EXTENSIONS = new Set(['.yaml', '.yml']);

export function emptyModelIndex() {
  return Object.fromEntries(MODEL_SCOPES.map((scope) => [scope, new Map()]));
}

export function modelIndexFromEntries(entries) {
  const index = emptyModelIndex();
  for (const entry of entries) {
    if (index[entry.scope]) {
      index[entry.scope].set(entry.identity, entry);
    }
  }
  return index;
}

export function normalizeModelIdentity(relativeFile) {
  const normalizedFile = String(relativeFile ?? '').replaceAll('\\', '/');
  const extension = [...YAML_EXTENSIONS].find((candidate) => normalizedFile.endsWith(candidate));
  if (!extension) {
    return undefined;
  }

  return normalizedFile
    .slice(0, -extension.length)
    .split('/')
    .filter(Boolean)
    .join('/');
}
