import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { BODYLESS_METHODS, HTTP_METHODS } from '../generator/service-generator.js';
import type { HttpMethod } from '../openapi/types.js';
import { getJsDocDescription } from './comments.js';
import { loadTypeSourcesFromSpec } from './model-loader.js';
import { typeNodeToSchema } from './type-to-schema.js';
import type { SchemaContext } from './type-to-schema.js';
import type { SchemaObject } from '../openapi/types.js';

const HTTP_METHOD_SET = new Set<HttpMethod>(HTTP_METHODS);
const ABSOLUTE_URL_PATTERN = /^(https?:\/\/[^/]+)(\/.*)?$/;

export interface ExtractedParam {
  name: string;
  required: boolean;
  schema: SchemaObject;
}

export interface ExtractedOperation {
  method: HttpMethod;
  pathKey: string;
  operationId: string;
  description?: string;
  pathParams: ExtractedParam[];
  queryParams: ExtractedParam[];
  requestBodySchema?: SchemaObject;
  responseSchema?: SchemaObject;
}

export interface ExtractedService {
  className?: string;
  basePath: string;
  operations: ExtractedOperation[];
}

/** Parses an Angular service file into its HTTP-calling operations, ignoring methods that never call HttpClient. */
export function parseServiceFile(filePath: string, ctx: SchemaContext, visited: Set<string>): ExtractedService {
  const absolute = path.resolve(filePath);
  const text = readFileSync(absolute, 'utf-8');
  const sourceFile = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.')
    ) {
      loadTypeSourcesFromSpec(statement.moduleSpecifier.text, absolute, ctx, visited);
    }
  }

  const classNode = sourceFile.statements.find(ts.isClassDeclaration);
  if (!classNode) {
    throw new Error(`No class declaration found in "${filePath}".`);
  }

  let basePath = findBasePath(classNode);
  const httpPropName = findHttpClientPropertyName(classNode);

  const operations: ExtractedOperation[] = [];
  for (const member of classNode.members) {
    if (!ts.isMethodDeclaration(member) || !member.body || !ts.isIdentifier(member.name)) continue;
    const call = findHttpCall(member.body, httpPropName);
    if (!call) continue;
    const { operation, discoveredOrigin } = buildOperation(member, member.name.text, call, sourceFile, ctx);
    if (!basePath && discoveredOrigin) {
      basePath = discoveredOrigin;
    }
    operations.push(operation);
  }

  return { className: classNode.name?.text, basePath, operations };
}

function findBasePath(classNode: ts.ClassDeclaration): string {
  for (const member of classNode.members) {
    if (
      ts.isPropertyDeclaration(member) &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'basePath' &&
      member.initializer &&
      ts.isStringLiteralLike(member.initializer)
    ) {
      return member.initializer.text;
    }
  }
  return '';
}

function findHttpClientPropertyName(classNode: ts.ClassDeclaration): string {
  const ctor = classNode.members.find(ts.isConstructorDeclaration);
  if (ctor) {
    for (const param of ctor.parameters) {
      if (ts.isIdentifier(param.name) && isHttpClientTypeNode(param.type)) {
        return param.name.text;
      }
    }
  }

  for (const member of classNode.members) {
    if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) continue;
    if (isHttpClientTypeNode(member.type)) {
      return member.name.text;
    }
    if (member.initializer && isInjectHttpClientCall(member.initializer)) {
      return member.name.text;
    }
  }

  return 'http';
}

function isHttpClientTypeNode(typeNode: ts.TypeNode | undefined): boolean {
  return !!typeNode && ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText() === 'HttpClient';
}

function isInjectHttpClientCall(expr: ts.Expression): boolean {
  return (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === 'inject' &&
    expr.arguments.length === 1 &&
    ts.isIdentifier(expr.arguments[0]!) &&
    expr.arguments[0]!.text === 'HttpClient'
  );
}

function findHttpCall(node: ts.Node, httpPropName: string): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined;
  const visit = (current: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(current) && isHttpCallExpression(current.expression, httpPropName)) {
      found = current;
      return;
    }
    ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function isHttpCallExpression(expr: ts.Expression, httpPropName: string): boolean {
  if (!ts.isPropertyAccessExpression(expr)) return false;
  if (!HTTP_METHOD_SET.has(expr.name.text as HttpMethod)) return false;
  const target = expr.expression;
  return (
    ts.isPropertyAccessExpression(target) &&
    target.name.text === httpPropName &&
    target.expression.kind === ts.SyntaxKind.ThisKeyword
  );
}

function buildOperation(
  method: ts.MethodDeclaration,
  operationId: string,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  ctx: SchemaContext,
): { operation: ExtractedOperation; discoveredOrigin?: string } {
  const httpMethod = ((call.expression as ts.PropertyAccessExpression).name.text) as HttpMethod;
  const { pathTemplate: rawTemplate, paramNames } = extractUrlPath(call.arguments[0]);
  const { origin, path: pathTemplate } = splitAbsoluteUrl(rawTemplate);

  const isBodyless = BODYLESS_METHODS.has(httpMethod);
  const bodyArgExpr = isBodyless ? undefined : call.arguments[1];
  const optionsArgExpr = isBodyless ? call.arguments[1] : call.arguments[2];

  const bodyParamName = bodyArgExpr && ts.isIdentifier(bodyArgExpr) ? bodyArgExpr.text : undefined;
  const queryParamNames = extractQueryParamNames(optionsArgExpr);

  const pathParams = paramNames
    .map((name) => findMethodParam(method, name))
    .filter((param): param is ts.ParameterDeclaration => !!param)
    .map((param) => ({
      name: (param.name as ts.Identifier).text,
      required: true,
      schema: typeNodeToSchema(param.type, ctx),
    }));

  const queryParams = queryParamNames
    .map((name) => findMethodParam(method, name))
    .filter((param): param is ts.ParameterDeclaration => !!param)
    .map((param) => ({
      name: (param.name as ts.Identifier).text,
      required: !param.questionToken,
      schema: typeNodeToSchema(param.type, ctx),
    }));

  const bodyParam = bodyParamName ? findMethodParam(method, bodyParamName) : undefined;
  const requestBodySchema = bodyParam ? typeNodeToSchema(bodyParam.type, ctx) : undefined;

  const responseTypeNode = unwrapObservable(method.type) ?? call.typeArguments?.[0];
  const responseSchema =
    responseTypeNode && responseTypeNode.kind !== ts.SyntaxKind.VoidKeyword
      ? typeNodeToSchema(responseTypeNode, ctx)
      : undefined;

  return {
    operation: {
      method: httpMethod,
      pathKey: pathTemplate,
      operationId,
      description: getJsDocDescription(sourceFile, method),
      pathParams,
      queryParams,
      requestBodySchema,
      responseSchema,
    },
    discoveredOrigin: origin,
  };
}

function splitAbsoluteUrl(template: string): { origin?: string; path: string } {
  const match = ABSOLUTE_URL_PATTERN.exec(template);
  if (!match) {
    return { path: template };
  }
  return { origin: match[1], path: match[2] ?? '/' };
}

function unwrapObservable(typeNode: ts.TypeNode | undefined): ts.TypeNode | undefined {
  if (typeNode && ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText() === 'Observable') {
    return typeNode.typeArguments?.[0];
  }
  return undefined;
}

function findMethodParam(method: ts.MethodDeclaration, name: string): ts.ParameterDeclaration | undefined {
  return method.parameters.find((param) => ts.isIdentifier(param.name) && param.name.text === name);
}

function extractUrlPath(urlArg: ts.Expression | undefined): { pathTemplate: string; paramNames: string[] } {
  if (!urlArg) {
    return { pathTemplate: '', paramNames: [] };
  }
  const paramNames: string[] = [];
  const pathTemplate = resolveUrlExpression(urlArg, paramNames);
  return { pathTemplate, paramNames };
}

/** Renders a URL-building expression back into a `{param}` path template, handling template literals and `+` concatenation. */
function resolveUrlExpression(expr: ts.Expression, paramNames: string[]): string {
  if (ts.isParenthesizedExpression(expr)) {
    return resolveUrlExpression(expr.expression, paramNames);
  }
  if (ts.isStringLiteralLike(expr)) {
    return expr.text;
  }
  if (ts.isTemplateExpression(expr)) {
    let result = expr.head.text;
    for (const span of expr.templateSpans) {
      result += resolveUrlPlaceholder(span.expression, paramNames);
      result += span.literal.text;
    }
    return result;
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return resolveUrlExpression(expr.left, paramNames) + resolveUrlExpression(expr.right, paramNames);
  }
  return resolveUrlPlaceholder(expr, paramNames);
}

/** Turns a non-literal URL sub-expression into a `{param}` placeholder, unwrapping single-arg calls like `encodeURIComponent(x)`. */
function resolveUrlPlaceholder(expr: ts.Expression, paramNames: string[]): string {
  if (ts.isParenthesizedExpression(expr)) {
    return resolveUrlPlaceholder(expr.expression, paramNames);
  }
  if (isThisBasePath(expr)) {
    return '';
  }
  if (ts.isCallExpression(expr) && expr.arguments.length === 1) {
    return resolveUrlPlaceholder(expr.arguments[0]!, paramNames);
  }
  const name = expr.getText().replace(/[^A-Za-z0-9_$]/g, '_');
  paramNames.push(name);
  return `{${name}}`;
}

function isThisBasePath(expr: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(expr) && expr.name.text === 'basePath' && expr.expression.kind === ts.SyntaxKind.ThisKeyword;
}

function extractQueryParamNames(optionsArg: ts.Expression | undefined): string[] {
  if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg)) {
    return [];
  }
  const paramsProp = optionsArg.properties.find(
    (prop): prop is ts.PropertyAssignment => ts.isPropertyAssignment(prop) && prop.name.getText() === 'params',
  );
  if (!paramsProp) {
    return [];
  }

  const value = paramsProp.initializer;
  const objLiteral = ts.isObjectLiteralExpression(value)
    ? value
    : ts.isCallExpression(value) && value.arguments[0] && ts.isObjectLiteralExpression(value.arguments[0])
      ? (value.arguments[0] as ts.ObjectLiteralExpression)
      : undefined;
  if (!objLiteral) {
    return [];
  }

  const names: string[] = [];
  for (const prop of objLiteral.properties) {
    if (ts.isShorthandPropertyAssignment(prop)) {
      names.push(prop.name.text);
    } else if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.initializer)) {
      names.push(prop.initializer.text);
    }
  }
  return names;
}
