import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateModels } from '../generator/model-generator.js';
import { buildModelRegistry } from '../generator/model-registry.js';
import { generateService } from '../generator/service-generator.js';
import type { OpenApiDocument } from '../openapi/types.js';

const spec: OpenApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Petstore' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/pets/{petId}': {
      get: {
        operationId: 'getPetById',
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
        },
      },
    },
  },
};

describe('generate pipeline', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'openapi-to-angular-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('writes models and a service that reference each other correctly', async () => {
    const modelsDir = path.join(workDir, 'models');
    const servicePath = path.join(workDir, 'petstore.service.ts');

    const models = await generateModels(spec, modelsDir);
    expect(models.map((model) => model.name)).toEqual(['Pet']);

    await generateService(spec, {
      className: 'PetstoreService',
      filePath: servicePath,
      modelsDir,
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: 'root' },
    });

    const modelContent = await readFile(path.join(modelsDir, 'pet.model.ts'), 'utf-8');
    expect(modelContent).toContain('export interface Pet');
    expect(modelContent).toContain('id: string;');
    expect(modelContent).toContain('name?: string;');

    const serviceContent = await readFile(servicePath, 'utf-8');
    expect(serviceContent).toContain(`import type { Pet } from './models/pet.model.js';`);
    expect(serviceContent).toContain("private readonly basePath = 'https://api.example.com';");
    expect(serviceContent).toContain('getPetById(petId: string): Observable<Pet> {');
    expect(serviceContent).toContain('this.http.get<Pet>(`${this.basePath}/pets/${petId}`)');
  });
});
