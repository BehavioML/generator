const UNSAFE_ID_CHARS = /[^A-Za-z0-9_]/g;

export function safeNodeId(prefix, identity) {
  const safePrefix = String(prefix ?? '').replace(UNSAFE_ID_CHARS, '_');
  const safeIdentity = String(identity ?? '')
    .replace(UNSAFE_ID_CHARS, '_')
    .replace(/^_+|_+$/g, '');

  const id = [safePrefix, safeIdentity].filter(Boolean).join('_');
  const normalized = id.replace(/_+/g, '_');
  return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
}

export function escapeLabel(label) {
  return String(label ?? '').replaceAll('"', '\\"');
}

export function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === undefined || value === null) {
    return [];
  }

  return [value];
}

export function referenceIdentity(value, candidateKeys = ['ref', 'identity', 'capability', 'event', 'id', 'name']) {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  for (const key of candidateKeys) {
    if (typeof value[key] === 'string') {
      return value[key];
    }
  }

  return undefined;
}
