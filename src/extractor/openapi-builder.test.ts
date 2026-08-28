import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractOpenApiDocument } from './openapi-builder.js';

describe('extractOpenApiDocument', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'openapi-to-angular-extract-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('extracts operations and TSDoc descriptions, resolves models, and skips non-HTTP methods', async () => {
    const modelsDir = path.join(workDir, 'models');
    await mkdir(modelsDir, { recursive: true });
    await writeFile(
      path.join(modelsDir, 'pet.model.ts'),
      ['export interface Pet {', '  id: string;', '  name?: string;', '}', ''].join('\n'),
      'utf-8',
    );

    const servicePath = path.join(workDir, 'petstore.service.ts');
    await writeFile(
      servicePath,
      [
        "import { HttpClient } from '@angular/common/http';",
        "import { Injectable } from '@angular/core';",
        "import type { Observable } from 'rxjs';",
        "import type { Pet } from './models/pet.model.js';",
        '',
        "@Injectable({ providedIn: 'root' })",
        'export class PetstoreService {',
        "  private readonly basePath = 'https://api.example.com';",
        '',
        '  constructor(private readonly http: HttpClient) {}',
        '',
        '  /**',
        '   * Fetches a single pet by id.',
        '   */',
        '  getPetById(petId: string): Observable<Pet> {',
        '    return this.http.get<Pet>(`${this.basePath}/pets/${petId}`);',
        '  }',
        '',
        '  listPets(status?: string): Observable<Array<Pet>> {',
        '    return this.http.get<Array<Pet>>(`${this.basePath}/pets`, { params: this.toParams({ status }) });',
        '  }',
        '',
        '  createPet(body: Pet): Observable<Pet> {',
        "    return this.http.post<Pet>(`${this.basePath}/pets`, body);",
        '  }',
        '',
        '  private formatPetName(pet: Pet): string {',
        '    return pet.name ?? pet.id;',
        '  }',
        '',
        '  private toParams(params: Record<string, unknown>): Record<string, string> {',
        '    return params as Record<string, string>;',
        '  }',
        '}',
        '',
      ].join('\n'),
      'utf-8',
    );

    const doc = await extractOpenApiDocument([servicePath], { title: 'Petstore', apiVersion: '2.0.0' });

    expect(doc.info).toEqual({ title: 'Petstore', version: '2.0.0' });
    expect(doc.servers).toEqual([{ url: 'https://api.example.com' }]);
    expect(Object.keys(doc.paths ?? {}).sort()).toEqual(['/pets', '/pets/{petId}']);

    const getById = doc.paths?.['/pets/{petId}']?.get;
    expect(getById?.operationId).toBe('getPetById');
    expect(getById?.description).toBe('Fetches a single pet by id.');
    expect(getById?.parameters).toEqual([
      { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
    ]);
    expect(getById?.responses?.['200']).toEqual({
      description: 'Successful response',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
    });

    const listPets = doc.paths?.['/pets']?.get;
    expect(listPets?.operationId).toBe('listPets');
    expect(listPets?.parameters).toEqual([{ name: 'status', in: 'query', required: false, schema: { type: 'string' } }]);
    const listPetsResponse = listPets?.responses?.['200'];
    expect(listPetsResponse && 'content' in listPetsResponse ? listPetsResponse.content?.['application/json']?.schema : undefined).toEqual({
      type: 'array',
      items: { $ref: '#/components/schemas/Pet' },
    });

    const createPet = doc.paths?.['/pets']?.post;
    expect(createPet?.operationId).toBe('createPet');
    expect(createPet?.requestBody).toEqual({
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } },
    });

    expect(doc.components?.schemas?.Pet).toEqual({
      type: 'object',
      properties: { id: { type: 'string' }, name: { type: 'string' } },
      required: ['id'],
    });
  });

  it('derives a title from the service class name when none is given', async () => {
    const servicePath = path.join(workDir, 'user-accounts.service.ts');
    await writeFile(
      servicePath,
      [
        "import { HttpClient } from '@angular/common/http';",
        "import type { Observable } from 'rxjs';",
        '',
        'export class UserAccountsService {',
        "  private readonly basePath = '';",
        '  constructor(private readonly http: HttpClient) {}',
        '',
        '  ping(): Observable<void> {',
        "    return this.http.get<void>(`${this.basePath}/ping`);",
        '  }',
        '}',
        '',
      ].join('\n'),
      'utf-8',
    );

    const doc = await extractOpenApiDocument([servicePath]);
    expect(doc.info?.title).toBe('User Accounts');
    expect(doc.paths?.['/ping']?.get?.responses?.['200']).toEqual({ description: 'Successful response' });
  });
});
