import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isRef } from '../openapi/refs.js';
import type { OpenApiDocument, SchemaObject } from '../openapi/types.js';
import { toKebabCase, toPascalCase } from '../utils/naming.js';
import { buildModelRegistry } from './model-registry.js';
import { propertyKey, resolveTypeExpression } from './type-mapper.js';

export interface GeneratedModel {
  name: string;
  fileName: string;
}

export async function generateModels(doc: OpenApiDocument, modelsDir: string): Promise<GeneratedModel[]> {
  const schemas = doc.components?.schemas ?? {};
  const entries = Object.entries(schemas);
  const registry = buildModelRegistry(doc);

  await mkdir(modelsDir, { recursive: true });

  const models: GeneratedModel[] = [];

  for (const [rawName, schema] of entries) {
    const name = toPascalCase(rawName);
    const fileName = `${toKebabCase(rawName)}.model.ts`;
    const { body, refs } = renderModelBody(name, schema);

    const imports = Array.from(refs)
      .filter((ref) => ref !== name && registry.has(ref))
      .sort()
      .map((ref) => `import type { ${ref} } from './${registry.get(ref)!.fileName.replace(/\.ts$/, '.js')}';`);

    const content = [...imports, imports.length > 0 ? '' : undefined, body, '']
      .filter((line): line is string => line !== undefined)
      .join('\n');

    await writeFile(path.join(modelsDir, fileName), content, 'utf-8');
    models.push({ name, fileName });
  }

  await writeFile(path.join(modelsDir, 'index.ts'), renderBarrel(models), 'utf-8');

  return models;
}

function renderModelBody(name: string, schema: SchemaObject): { body: string; refs: Set<string> } {
  const refs = new Set<string>();

  if (isPlainObjectSchema(schema) && schema.properties) {
    const lines = Object.entries(schema.properties).map(([key, value]) => {
      const optional = !schema.required?.includes(key);
      const type = resolveTypeExpression(value, refs);
      return `  ${propertyKey(key)}${optional ? '?' : ''}: ${type};`;
    });
    return { body: `export interface ${name} {\n${lines.join('\n')}\n}`, refs };
  }

  const type = resolveTypeExpression(schema, refs);
  return { body: `export type ${name} = ${type};`, refs };
}

function isPlainObjectSchema(schema: SchemaObject): boolean {
  return (
    !isRef(schema) &&
    !schema.allOf &&
    !schema.oneOf &&
    !schema.anyOf &&
    !schema.enum &&
    (schema.type === 'object' || schema.type === undefined)
  );
}

function renderBarrel(models: GeneratedModel[]): string {
  return models.map((model) => `export * from './${model.fileName.replace(/\.ts$/, '.js')}';`).join('\n') + '\n';
}
