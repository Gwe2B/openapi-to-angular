export type HttpMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch';

export interface Ref {
  $ref: string;
}

export interface SchemaObject {
  $ref?: string;
  type?: string;
  format?: string;
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  enum?: Array<string | number | boolean>;
  nullable?: boolean;
  additionalProperties?: SchemaObject | boolean;
  allOf?: SchemaObject[];
  oneOf?: SchemaObject[];
  anyOf?: SchemaObject[];
  description?: string;
}

export interface MediaTypeObject {
  schema?: SchemaObject;
}

export interface ParameterObject {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  schema?: SchemaObject;
}

export interface RequestBodyObject {
  required?: boolean;
  content?: Record<string, MediaTypeObject>;
}

export interface ResponseObject {
  description?: string;
  content?: Record<string, MediaTypeObject>;
}

export interface OperationObject {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: Array<ParameterObject | Ref>;
  requestBody?: RequestBodyObject | Ref;
  responses?: Record<string, ResponseObject | Ref>;
}

export type PathItemObject = Partial<Record<HttpMethod, OperationObject>>;

export interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  servers?: Array<{ url: string }>;
  paths?: Record<string, PathItemObject>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    parameters?: Record<string, ParameterObject>;
    requestBodies?: Record<string, RequestBodyObject>;
    responses?: Record<string, ResponseObject>;
  };
}
