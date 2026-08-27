import type { OpenApiDocument, Ref } from './types.js';

export function isRef(value: unknown): value is Ref {
  return (
    !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).$ref === 'string'
  );
}

export function refName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1] ?? ref;
}

export function resolveRef<T>(doc: OpenApiDocument, ref: string): T {
  const segments = ref.replace(/^#\//, '').split('/');
  let node: unknown = doc;
  for (const segment of segments) {
    if (node == null || typeof node !== 'object') {
      throw new Error(`Cannot resolve reference "${ref}"`);
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (node === undefined) {
    throw new Error(`Cannot resolve reference "${ref}"`);
  }
  return node as T;
}

/** Follows a possible chain of `$ref`s until it reaches a concrete value. */
export function deref<T>(doc: OpenApiDocument, value: T | Ref | undefined): T | undefined {
  let current: unknown = value;
  const seen = new Set<string>();
  while (isRef(current)) {
    if (seen.has(current.$ref)) {
      throw new Error(`Circular reference detected while resolving "${current.$ref}"`);
    }
    seen.add(current.$ref);
    current = resolveRef(doc, current.$ref);
  }
  return current as T | undefined;
}
