import type {
  OpenApiDocument,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ResponseObject,
  SchemaObject,
} from '../openapi/types.js';
import { parseServiceFile } from './service-parser.js';
import type { ExtractedOperation } from './service-parser.js';
import { createSchemaContext } from './type-to-schema.js';

export interface ExtractOptions {
  title?: string;
  apiVersion?: string;
}

/** Reverse of `generateModels`/`generateService`: builds an OpenAPI document from one or more Angular service files. */
export async function extractOpenApiDocument(
  serviceFilePaths: string[],
  options: ExtractOptions = {},
): Promise<OpenApiDocument> {
  const ctx = createSchemaContext();
  const visited = new Set<string>();

  const paths: Record<string, PathItemObject> = {};
  let basePath: string | undefined;
  let firstClassName: string | undefined;

  for (const filePath of serviceFilePaths) {
    const service = parseServiceFile(filePath, ctx, visited);
    if (!basePath && service.basePath) {
      basePath = service.basePath;
    }
    if (!firstClassName) {
      firstClassName = service.className;
    }

    for (const operation of service.operations) {
      const pathItem = paths[operation.pathKey] ?? {};
      pathItem[operation.method] = toOperationObject(operation);
      paths[operation.pathKey] = pathItem;
    }
  }

  const schemas: Record<string, SchemaObject> = {};
  for (const [name, schema] of ctx.schemas) {
    schemas[name] = schema;
  }

  for (const warning of ctx.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  return {
    openapi: '3.0.3',
    info: {
      title: options.title ?? deriveTitle(firstClassName),
      version: options.apiVersion ?? '1.0.0',
    },
    ...(basePath ? { servers: [{ url: basePath }] } : {}),
    paths,
    ...(Object.keys(schemas).length > 0 ? { components: { schemas } } : {}),
  };
}

function toOperationObject(operation: ExtractedOperation): OperationObject {
  const parameters: ParameterObject[] = [
    ...operation.pathParams.map((param) => ({
      name: param.name,
      in: 'path' as const,
      required: true,
      schema: param.schema,
    })),
    ...operation.queryParams.map((param) => ({
      name: param.name,
      in: 'query' as const,
      required: param.required,
      schema: param.schema,
    })),
  ];

  const responses: Record<string, ResponseObject> = {
    '200': operation.responseSchema
      ? { description: 'Successful response', content: { 'application/json': { schema: operation.responseSchema } } }
      : { description: 'Successful response' },
  };

  return {
    operationId: operation.operationId,
    ...(operation.description ? { description: operation.description } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(operation.requestBodySchema
      ? { requestBody: { required: true, content: { 'application/json': { schema: operation.requestBodySchema } } } }
      : {}),
    responses,
  };
}

function deriveTitle(className: string | undefined): string {
  if (!className) {
    return 'API';
  }
  const withoutSuffix = className.replace(/Service$/, '');
  const spaced = withoutSuffix.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return spaced.length > 0 ? spaced : 'API';
}
