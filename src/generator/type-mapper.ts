import { isRef, refName } from '../openapi/refs.js';
import type { SchemaObject } from '../openapi/types.js';
import { toPascalCase } from '../utils/naming.js';

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function propertyKey(key: string): string {
  return IDENTIFIER_PATTERN.test(key) ? key : `'${key}'`;
}

/** Renders the TypeScript type expression for a schema, collecting any referenced model names into `refs`. */
export function resolveTypeExpression(schema: SchemaObject | undefined, refs: Set<string>): string {
  if (!schema) {
    return 'unknown';
  }

  if (isRef(schema)) {
    const name = toPascalCase(refName(schema.$ref));
    refs.add(name);
    return name;
  }

  if (schema.enum) {
    return schema.enum.map((value) => (typeof value === 'string' ? `'${value}'` : String(value))).join(' | ');
  }

  if (schema.allOf) {
    return schema.allOf.map((member) => resolveTypeExpression(member, refs)).join(' & ');
  }

  if (schema.oneOf) {
    return schema.oneOf.map((member) => resolveTypeExpression(member, refs)).join(' | ');
  }

  if (schema.anyOf) {
    return schema.anyOf.map((member) => resolveTypeExpression(member, refs)).join(' | ');
  }

  switch (schema.type) {
    case 'string':
      return schema.format === 'binary' ? 'Blob' : 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return `Array<${resolveTypeExpression(schema.items, refs)}>`;
    case 'object':
    case undefined:
      if (schema.properties) {
        const members = Object.entries(schema.properties).map(([key, value]) => {
          const optional = !schema.required?.includes(key);
          return `${propertyKey(key)}${optional ? '?' : ''}: ${resolveTypeExpression(value, refs)}`;
        });
        return `{ ${members.join('; ')} }`;
      }
      if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        return `Record<string, ${resolveTypeExpression(schema.additionalProperties, refs)}>`;
      }
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}
