import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenApiDocument } from '../openapi/types.js';
import { buildModelRegistry } from './model-registry.js';
import { generateService } from './service-generator.js';

const spec: OpenApiDocument = {
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        responses: { '200': { content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } } } },
      },
    },
  },
};

describe('generateService injectable decorator', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'openapi-to-angular-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('renders providedIn: root by default', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: 'root' },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain(`@Injectable({ providedIn: 'root' })`);
  });

  it('renders a bare @Injectable() when kind is "bare"', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'bare' },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('@Injectable()\nexport class PetsService');
  });

  it('renders a custom providedIn string', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: 'platform' },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain(`@Injectable({ providedIn: 'platform' })`);
  });

  it('renders providedIn: null without quotes', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: null },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('@Injectable({ providedIn: null })');
  });
});
