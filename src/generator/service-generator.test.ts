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

const specWithDescription: OpenApiDocument = {
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        description: 'Lists all pets.\nSupports pagination.',
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

  it('renders a bare @Service() when kind is "service"', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'service' },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain("import { Service, inject } from '@angular/core';");
    expect(content).toContain('@Service()\nexport class PetsService');
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

describe('generateService injection pattern', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'openapi-to-angular-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('defaults to inject() field injection', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: 'root' },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain("import { Injectable, inject } from '@angular/core';");
    expect(content).toContain('private readonly http = inject(HttpClient);');
    expect(content).not.toContain('constructor(');
  });

  it('uses constructor injection when injectionPattern is "constructor"', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: 'root' },
      injectionPattern: 'constructor',
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain("import { Injectable } from '@angular/core';");
    expect(content).toContain('constructor(private readonly http: HttpClient) {}');
    expect(content).not.toContain('inject(');
  });
});

describe('generateService doc comments', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'openapi-to-angular-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('renders a TSDoc comment from the operation description by default', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(specWithDescription, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(specWithDescription),
      injectable: { kind: 'providedIn', value: 'root' },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('  /**\n   * Lists all pets.\n   * Supports pagination.\n   */\n  listPets()');
  });

  it('omits the TSDoc comment when doc is false', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(specWithDescription, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(specWithDescription),
      injectable: { kind: 'providedIn', value: 'root' },
      doc: false,
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).not.toContain('/**');
  });

  it('omits the modifier on methods by default', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: 'root' },
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('  listPets()');
    expect(content).not.toContain('public listPets()');
  });

  it('adds an explicit public modifier when visibility is true', async () => {
    const filePath = path.join(workDir, 'pets.service.ts');
    await generateService(spec, {
      className: 'PetsService',
      filePath,
      modelsDir: path.join(workDir, 'models'),
      modelRegistry: buildModelRegistry(spec),
      injectable: { kind: 'providedIn', value: 'root' },
      visibility: true,
    });
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('  public listPets()');
  });
});
