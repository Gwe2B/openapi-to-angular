import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createSchemaContext, typeNodeToSchema } from './type-to-schema.js';

function parseTypeAlias(source: string): ts.TypeNode {
  const sourceFile = ts.createSourceFile('test.ts', `type T = ${source};`, ts.ScriptTarget.Latest, true);
  const decl = sourceFile.statements[0] as ts.TypeAliasDeclaration;
  return decl.type;
}

describe('typeNodeToSchema', () => {
  it('maps primitives', () => {
    const ctx = createSchemaContext();
    expect(typeNodeToSchema(parseTypeAlias('string'), ctx)).toEqual({ type: 'string' });
    expect(typeNodeToSchema(parseTypeAlias('number'), ctx)).toEqual({ type: 'number' });
    expect(typeNodeToSchema(parseTypeAlias('boolean'), ctx)).toEqual({ type: 'boolean' });
  });

  it('maps arrays', () => {
    const ctx = createSchemaContext();
    expect(typeNodeToSchema(parseTypeAlias('Array<string>'), ctx)).toEqual({ type: 'array', items: { type: 'string' } });
    expect(typeNodeToSchema(parseTypeAlias('number[]'), ctx)).toEqual({ type: 'array', items: { type: 'number' } });
  });

  it('maps string literal unions to string enums', () => {
    const ctx = createSchemaContext();
    expect(typeNodeToSchema(parseTypeAlias("'a' | 'b'"), ctx)).toEqual({ type: 'string', enum: ['a', 'b'] });
  });

  it('maps non-literal unions to oneOf', () => {
    const ctx = createSchemaContext();
    expect(typeNodeToSchema(parseTypeAlias('string | number'), ctx)).toEqual({
      oneOf: [{ type: 'string' }, { type: 'number' }],
    });
  });

  it('maps inline object types, tracking required vs optional members', () => {
    const ctx = createSchemaContext();
    expect(typeNodeToSchema(parseTypeAlias('{ a: string; b?: number }'), ctx)).toEqual({
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'number' } },
      required: ['a'],
    });
  });

  it('resolves named type references into ctx.schemas as a $ref', () => {
    const ctx = createSchemaContext();
    const sourceFile = ts.createSourceFile(
      'models.ts',
      'interface Pet { id: string; name?: string; }',
      ts.ScriptTarget.Latest,
      true,
    );
    const iface = sourceFile.statements[0] as ts.InterfaceDeclaration;
    ctx.typeSources.set('Pet', { node: iface });

    expect(typeNodeToSchema(parseTypeAlias('Pet'), ctx)).toEqual({ $ref: '#/components/schemas/Pet' });
    expect(ctx.schemas.get('Pet')).toEqual({
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id'],
    });
  });

  it('does not infinitely recurse on self-referential types', () => {
    const ctx = createSchemaContext();
    const sourceFile = ts.createSourceFile(
      'models.ts',
      'interface Node { value: string; children: Array<Node>; }',
      ts.ScriptTarget.Latest,
      true,
    );
    const iface = sourceFile.statements[0] as ts.InterfaceDeclaration;
    ctx.typeSources.set('Node', { node: iface });

    expect(typeNodeToSchema(parseTypeAlias('Node'), ctx)).toEqual({ $ref: '#/components/schemas/Node' });
    expect(ctx.schemas.get('Node')).toEqual({
      type: 'object',
      properties: {
        value: { type: 'string' },
        children: { type: 'array', items: { $ref: '#/components/schemas/Node' } },
      },
      required: ['value', 'children'],
    });
  });
});
