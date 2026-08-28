import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deref } from '../openapi/refs.js';
import type {
  HttpMethod,
  OpenApiDocument,
  OperationObject,
  ParameterObject,
  SchemaObject,
} from '../openapi/types.js';
import { toCamelCase, toPascalCase } from '../utils/naming.js';
import type { ModelRegistryEntry } from './model-registry.js';
import { resolveTypeExpression } from './type-mapper.js';

export const HTTP_METHODS: HttpMethod[] = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
export const BODYLESS_METHODS = new Set<HttpMethod>(['get', 'delete', 'head', 'options']);

/** `providedIn` renders `@Injectable({ providedIn: <value> })`, `null` becoming the literal `null`; `service` renders a bare `@Service()`. */
export type InjectableConfig = { kind: 'providedIn'; value: string | null } | { kind: 'service' };

/** `constructor` uses classic constructor-parameter injection; `inject` uses Angular's `inject()` function as a field initializer. */
export type InjectionPattern = 'constructor' | 'inject';

export interface ServiceGenerationOptions {
  className: string;
  filePath: string;
  modelsDir: string;
  modelRegistry: Map<string, ModelRegistryEntry>;
  injectable: InjectableConfig;
  injectionPattern?: InjectionPattern;
  /** Emit a TSDoc comment from each operation's `description`. Default: `true`. */
  doc?: boolean;
  /** Prefix generated methods with an explicit `public` modifier. Default: `false`. */
  visibility?: boolean;
}

interface CollectedOperation {
  method: HttpMethod;
  pathKey: string;
  operation: OperationObject;
}

export async function generateService(doc: OpenApiDocument, options: ServiceGenerationOptions): Promise<void> {
  const operations = collectOperations(doc);
  const usedNames = new Set<string>();
  const refs = new Set<string>();
  let usesParamsHelper = false;
  const includeDoc = options.doc ?? true;
  const explicitVisibility = options.visibility ?? false;

  const methods = operations.map(({ method, pathKey, operation }) => {
    const name = uniqueOperationName(usedNames, operationName(method, pathKey, operation.operationId));
    const built = buildMethod(doc, method, pathKey, operation, name, refs, includeDoc, explicitVisibility);
    usesParamsHelper = usesParamsHelper || built.usesParams;
    return built.code;
  });

  const importDir = toImportDir(options.filePath, options.modelsDir);
  const modelImports = Array.from(refs)
    .filter((ref) => options.modelRegistry.has(ref))
    .sort()
    .map((ref) => {
      const entry = options.modelRegistry.get(ref)!;
      return `import type { ${ref} } from '${importDir}/${entry.fileName.replace(/\.ts$/, '.js')}';`;
    });

  const basePath = doc.servers?.[0]?.url ?? '';
  const content = renderServiceFile(
    options.className,
    basePath,
    modelImports,
    methods,
    usesParamsHelper,
    options.injectable,
    options.injectionPattern ?? 'inject',
  );

  await mkdir(path.dirname(options.filePath), { recursive: true });
  await writeFile(options.filePath, content, 'utf-8');
}

function collectOperations(doc: OpenApiDocument): CollectedOperation[] {
  const result: CollectedOperation[] = [];
  for (const [pathKey, pathItem] of Object.entries(doc.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) {
        result.push({ method, pathKey, operation });
      }
    }
  }
  return result;
}

function buildMethod(
  doc: OpenApiDocument,
  method: HttpMethod,
  pathKey: string,
  operation: OperationObject,
  name: string,
  refs: Set<string>,
  includeDoc: boolean,
  explicitVisibility: boolean,
): { code: string; usesParams: boolean } {
  const parameters = (operation.parameters ?? [])
    .map((parameter) => deref<ParameterObject>(doc, parameter))
    .filter((parameter): parameter is ParameterObject => !!parameter);

  const pathParams = parameters.filter((parameter) => parameter.in === 'path');
  const queryParams = parameters.filter((parameter) => parameter.in === 'query');

  const requestBody = deref(doc, operation.requestBody);
  const bodySchema = requestBody?.content?.['application/json']?.schema;
  const bodyType = bodySchema ? resolveTypeExpression(bodySchema, refs) : undefined;

  const responseSchema = pickResponseSchema(doc, operation);
  const responseType = responseSchema ? resolveTypeExpression(responseSchema, refs) : undefined;

  const args: string[] = [];
  for (const parameter of pathParams) {
    const type = parameter.schema ? resolveTypeExpression(parameter.schema, refs) : 'string';
    args.push(`${toCamelCase(parameter.name)}: ${type}`);
  }
  if (bodyType) {
    args.push(`body: ${bodyType}`);
  }
  for (const parameter of queryParams) {
    const type = parameter.schema ? resolveTypeExpression(parameter.schema, refs) : 'string';
    args.push(`${toCamelCase(parameter.name)}${parameter.required ? '' : '?'}: ${type}`);
  }

  const url = buildUrlExpression(pathKey, pathParams);
  const usesParams = queryParams.length > 0;
  const paramsArg = usesParams
    ? `, { params: this.toParams({ ${queryParams.map((parameter) => toCamelCase(parameter.name)).join(', ')} }) }`
    : '';

  const genericArg = responseType ? `<${responseType}>` : '<void>';
  const call = BODYLESS_METHODS.has(method)
    ? `this.http.${method}${genericArg}(${url}${paramsArg})`
    : `this.http.${method}${genericArg}(${url}, ${bodyType ? 'body' : 'null'}${paramsArg})`;

  const returnType = `Observable<${responseType ?? 'void'}>`;
  const modifier = explicitVisibility ? 'public ' : '';

  const lines = [`  ${modifier}${name}(${args.join(', ')}): ${returnType} {`, `    return ${call};`, '  }'];
  const description = operation.description?.trim();
  if (includeDoc && description) {
    lines.unshift(renderJsDoc(description, '  '));
  }
  const code = lines.join('\n');

  return { code, usesParams };
}

function renderJsDoc(description: string, indent: string): string {
  const lines = description.split('\n').map((line) => line.trim());
  if (lines.length === 1) {
    return `${indent}/** ${lines[0]} */`;
  }
  return [`${indent}/**`, ...lines.map((line) => `${indent} * ${line}`), `${indent} */`].join('\n');
}

function pickResponseSchema(doc: OpenApiDocument, operation: OperationObject): SchemaObject | undefined {
  const responses = operation.responses ?? {};
  const successKey = Object.keys(responses).find((code) => /^2\d\d$/.test(code)) ?? (responses.default ? 'default' : undefined);
  if (!successKey) {
    return undefined;
  }
  const response = deref(doc, responses[successKey]);
  return response?.content?.['application/json']?.schema;
}

function buildUrlExpression(pathKey: string, pathParams: ParameterObject[]): string {
  let template = pathKey;
  for (const parameter of pathParams) {
    template = template.replace(`{${parameter.name}}`, `\${${toCamelCase(parameter.name)}}`);
  }
  return `\`\${this.basePath}${template}\``;
}

function operationName(method: HttpMethod, pathKey: string, operationId?: string): string {
  if (operationId) {
    return toCamelCase(operationId);
  }
  const words = [method as string];
  for (const segment of pathKey.split('/').filter(Boolean)) {
    if (segment.startsWith('{') && segment.endsWith('}')) {
      words.push('by', segment.slice(1, -1));
    } else {
      words.push(segment);
    }
  }
  return words.map((word, index) => (index === 0 ? word.toLowerCase() : toPascalCase(word))).join('');
}

function uniqueOperationName(used: Set<string>, base: string): string {
  let name = base;
  let counter = 2;
  while (used.has(name)) {
    name = `${base}${counter}`;
    counter += 1;
  }
  used.add(name);
  return name;
}

function toImportDir(serviceFilePath: string, modelsDir: string): string {
  const relative = path.relative(path.dirname(serviceFilePath), modelsDir).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function renderServiceFile(
  className: string,
  basePath: string,
  modelImports: string[],
  methods: string[],
  usesParamsHelper: boolean,
  injectable: InjectableConfig,
  injectionPattern: InjectionPattern,
): string {
  const decoratorName = injectable.kind === 'service' ? 'Service' : 'Injectable';
  const coreImports = injectionPattern === 'inject' ? [decoratorName, 'inject'] : [decoratorName];

  const imports = [
    `import { HttpClient } from '@angular/common/http';`,
    `import { ${coreImports.join(', ')} } from '@angular/core';`,
    `import type { Observable } from 'rxjs';`,
    ...modelImports,
  ];

  const httpField =
    injectionPattern === 'inject'
      ? '  private readonly http = inject(HttpClient);'
      : '  constructor(private readonly http: HttpClient) {}';

  const parts: string[] = [
    imports.join('\n'),
    '',
    renderInjectableDecorator(injectable),
    `export class ${className} {`,
    `  private readonly basePath = '${basePath}';`,
    '',
    httpField,
    '',
    methods.join('\n\n'),
  ];

  if (usesParamsHelper) {
    parts.push(renderParamsHelper());
  }

  parts.push('}', '');

  return parts.join('\n');
}

function renderInjectableDecorator(injectable: InjectableConfig): string {
  if (injectable.kind === 'service') {
    return '@Service()';
  }
  const value = injectable.value === null ? 'null' : `'${injectable.value}'`;
  return `@Injectable({ providedIn: ${value} })`;
}

function renderParamsHelper(): string {
  return [
    '',
    '  private toParams(',
    '    params: Record<string, unknown>,',
    '  ): Record<string, string | number | boolean | ReadonlyArray<string | number | boolean>> {',
    '    const result: Record<string, string | number | boolean | ReadonlyArray<string | number | boolean>> = {};',
    '    for (const [key, value] of Object.entries(params)) {',
    '      if (value !== undefined && value !== null) {',
    '        result[key] = value as string | number | boolean | ReadonlyArray<string | number | boolean>;',
    '      }',
    '    }',
    '    return result;',
    '  }',
  ].join('\n');
}
