import type { OpenApiDocument } from '../openapi/types.js';
import { toKebabCase, toPascalCase } from '../utils/naming.js';

export interface ModelRegistryEntry {
  pascalName: string;
  fileName: string;
}

/** Maps every `components.schemas` entry's PascalCase name to its generated model file. */
export function buildModelRegistry(doc: OpenApiDocument): Map<string, ModelRegistryEntry> {
  const schemas = doc.components?.schemas ?? {};
  const registry = new Map<string, ModelRegistryEntry>();

  for (const rawName of Object.keys(schemas)) {
    const pascalName = toPascalCase(rawName);
    registry.set(pascalName, { pascalName, fileName: `${toKebabCase(rawName)}.model.ts` });
  }

  return registry;
}
