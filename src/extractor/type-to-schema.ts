import ts from 'typescript';
import type { SchemaObject } from '../openapi/types.js';

export interface TypeSource {
  node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
}

export interface SchemaContext {
  /** PascalCase type name -> the interface/type alias declaration it was parsed from. */
  typeSources: Map<string, TypeSource>;
  /** components.schemas being built up as named types are encountered. */
  schemas: Map<string, SchemaObject>;
  resolving: Set<string>;
  /** Human-readable diagnostics collected while extracting (e.g. unresolved imports). */
  warnings: string[];
}

export function createSchemaContext(): SchemaContext {
  return { typeSources: new Map(), schemas: new Map(), resolving: new Set(), warnings: [] };
}

/** Renders the OpenAPI schema for a TS type node, registering any named type it references into `ctx.schemas`. */
export function typeNodeToSchema(typeNode: ts.TypeNode | undefined, ctx: SchemaContext): SchemaObject {
  if (!typeNode) {
    return {};
  }

  switch (typeNode.kind) {
    case ts.SyntaxKind.StringKeyword:
      return { type: 'string' };
    case ts.SyntaxKind.NumberKeyword:
      return { type: 'number' };
    case ts.SyntaxKind.BooleanKeyword:
      return { type: 'boolean' };
    case ts.SyntaxKind.AnyKeyword:
    case ts.SyntaxKind.UnknownKeyword:
    case ts.SyntaxKind.VoidKeyword:
      return {};
    default:
      break;
  }

  if (ts.isParenthesizedTypeNode(typeNode)) {
    return typeNodeToSchema(typeNode.type, ctx);
  }
  if (ts.isArrayTypeNode(typeNode)) {
    return { type: 'array', items: typeNodeToSchema(typeNode.elementType, ctx) };
  }
  if (ts.isLiteralTypeNode(typeNode)) {
    return literalToSchema(typeNode.literal);
  }
  if (ts.isUnionTypeNode(typeNode)) {
    return unionToSchema(typeNode, ctx);
  }
  if (ts.isIntersectionTypeNode(typeNode)) {
    return { allOf: typeNode.types.map((member) => typeNodeToSchema(member, ctx)) };
  }
  if (ts.isTypeLiteralNode(typeNode)) {
    return typeMembersToObjectSchema(typeNode.members, ctx);
  }
  if (ts.isTypeReferenceNode(typeNode)) {
    return typeReferenceToSchema(typeNode, ctx);
  }

  return {};
}

function literalToSchema(literal: ts.Expression): SchemaObject {
  if (ts.isStringLiteral(literal)) {
    return { type: 'string', enum: [literal.text] };
  }
  if (ts.isNumericLiteral(literal)) {
    return { type: 'number', enum: [Number(literal.text)] };
  }
  if (literal.kind === ts.SyntaxKind.TrueKeyword) {
    return { type: 'boolean', enum: [true] };
  }
  if (literal.kind === ts.SyntaxKind.FalseKeyword) {
    return { type: 'boolean', enum: [false] };
  }
  return {};
}

function unionToSchema(typeNode: ts.UnionTypeNode, ctx: SchemaContext): SchemaObject {
  const members = typeNode.types.filter(
    (member) => member.kind !== ts.SyntaxKind.NullKeyword && member.kind !== ts.SyntaxKind.UndefinedKeyword,
  );
  const nullable = members.length !== typeNode.types.length;
  const nullableField = nullable ? { nullable: true as const } : {};

  if (members.length > 0 && members.every(ts.isLiteralTypeNode)) {
    const values = members.map((member) => (member as ts.LiteralTypeNode).literal);
    const allStrings = values.every(ts.isStringLiteral);
    const enumValues = values.map((value) => {
      if (ts.isStringLiteral(value)) return value.text;
      if (ts.isNumericLiteral(value)) return Number(value.text);
      return value.kind === ts.SyntaxKind.TrueKeyword;
    });
    return { ...(allStrings ? { type: 'string' as const } : {}), enum: enumValues, ...nullableField };
  }

  return { oneOf: members.map((member) => typeNodeToSchema(member, ctx)), ...nullableField };
}

function typeReferenceToSchema(typeNode: ts.TypeReferenceNode, ctx: SchemaContext): SchemaObject {
  const name = typeNode.typeName.getText();
  const args = typeNode.typeArguments;

  if ((name === 'Array' || name === 'ReadonlyArray') && args?.[0]) {
    return { type: 'array', items: typeNodeToSchema(args[0], ctx) };
  }
  if (name === 'Record' && args?.[1]) {
    return { type: 'object', additionalProperties: typeNodeToSchema(args[1], ctx) };
  }
  if (name === 'Blob') {
    return { type: 'string', format: 'binary' };
  }
  if (name === 'Date') {
    return { type: 'string', format: 'date-time' };
  }
  if (name === 'Partial' && args?.[0]) {
    const base = resolveObjectSchema(args[0], ctx);
    return base ? { type: 'object', properties: base.properties ?? {} } : {};
  }
  if (name === 'Required' && args?.[0]) {
    const base = resolveObjectSchema(args[0], ctx);
    return base ? { type: 'object', properties: base.properties ?? {}, required: Object.keys(base.properties ?? {}) } : {};
  }
  if ((name === 'Omit' || name === 'Pick') && args?.[0] && args[1]) {
    return pickOrOmitToSchema(name, args[0], args[1], ctx);
  }

  return resolveNamedType(name, ctx);
}

/** Best-effort: resolves a type node to its object schema shape, following one level of `$ref`. */
function resolveObjectSchema(typeNode: ts.TypeNode, ctx: SchemaContext): SchemaObject | undefined {
  const schema = typeNodeToSchema(typeNode, ctx);
  if (schema.$ref) {
    return ctx.schemas.get(schema.$ref.split('/').pop()!);
  }
  return schema;
}

function pickOrOmitToSchema(
  kind: 'Omit' | 'Pick',
  targetNode: ts.TypeNode,
  keysNode: ts.TypeNode,
  ctx: SchemaContext,
): SchemaObject {
  const base = resolveObjectSchema(targetNode, ctx);
  const keys = stringLiteralUnionToKeys(keysNode);
  if (!base || !keys) {
    return base ?? {};
  }

  const allKeys = Object.keys(base.properties ?? {});
  const kept = kind === 'Pick' ? keys.filter((key) => allKeys.includes(key)) : allKeys.filter((key) => !keys.includes(key));

  const properties: Record<string, SchemaObject> = {};
  for (const key of kept) {
    const propertySchema = base.properties?.[key];
    if (propertySchema) properties[key] = propertySchema;
  }
  const required = base.required?.filter((key) => kept.includes(key));

  return { type: 'object', properties, ...(required && required.length > 0 ? { required } : {}) };
}

function stringLiteralUnionToKeys(typeNode: ts.TypeNode): string[] | undefined {
  const members = ts.isUnionTypeNode(typeNode) ? typeNode.types : [typeNode];
  const keys: string[] = [];
  for (const member of members) {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) {
      return undefined;
    }
    keys.push(member.literal.text);
  }
  return keys;
}

function resolveNamedType(name: string, ctx: SchemaContext): SchemaObject {
  const source = ctx.typeSources.get(name);
  if (!source) {
    return {};
  }

  if (!ctx.schemas.has(name) && !ctx.resolving.has(name)) {
    ctx.resolving.add(name);
    ctx.schemas.set(name, {});
    ctx.schemas.set(name, declarationToSchema(source.node, ctx));
    ctx.resolving.delete(name);
  }

  return { $ref: `#/components/schemas/${name}` };
}

function declarationToSchema(node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration, ctx: SchemaContext): SchemaObject {
  if (ts.isInterfaceDeclaration(node)) {
    return typeMembersToObjectSchema(node.members, ctx);
  }
  return typeNodeToSchema(node.type, ctx);
}

function typeMembersToObjectSchema(members: ts.NodeArray<ts.TypeElement>, ctx: SchemaContext): SchemaObject {
  const properties: Record<string, SchemaObject> = {};
  const required: string[] = [];

  for (const member of members) {
    if (!ts.isPropertySignature(member) || !member.type) continue;
    const key = propertyName(member.name);
    properties[key] = typeNodeToSchema(member.type, ctx);
    if (!member.questionToken) required.push(key);
  }

  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}

function propertyName(name: ts.PropertyName): string {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}
