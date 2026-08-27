import { describe, expect, it } from 'vitest';
import type { SchemaObject } from '../openapi/types.js';
import { resolveTypeExpression } from './type-mapper.js';

describe('resolveTypeExpression', () => {
  it('maps primitives', () => {
    const refs = new Set<string>();
    expect(resolveTypeExpression({ type: 'string' }, refs)).toBe('string');
    expect(resolveTypeExpression({ type: 'integer' }, refs)).toBe('number');
    expect(resolveTypeExpression({ type: 'boolean' }, refs)).toBe('boolean');
  });

  it('maps arrays', () => {
    const refs = new Set<string>();
    const schema: SchemaObject = { type: 'array', items: { type: 'string' } };
    expect(resolveTypeExpression(schema, refs)).toBe('Array<string>');
  });

  it('maps enums to string literal unions', () => {
    const refs = new Set<string>();
    const schema: SchemaObject = { type: 'string', enum: ['a', 'b'] };
    expect(resolveTypeExpression(schema, refs)).toBe("'a' | 'b'");
  });

  it('resolves $ref to a PascalCase type name and records it', () => {
    const refs = new Set<string>();
    const schema: SchemaObject = { $ref: '#/components/schemas/new-pet' };
    expect(resolveTypeExpression(schema, refs)).toBe('NewPet');
    expect(refs.has('NewPet')).toBe(true);
  });

  it('inlines nested object properties', () => {
    const refs = new Set<string>();
    const schema: SchemaObject = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string' },
        tag: { type: 'string' },
      },
    };
    expect(resolveTypeExpression(schema, refs)).toBe('{ id: string; tag?: string }');
  });
});
