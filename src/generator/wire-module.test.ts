import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { wireServiceProvider } from './wire-module.js';

describe('wireServiceProvider', () => {
  let workDir: string;
  let servicePath: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'openapi-to-angular-'));
    servicePath = path.join(workDir, 'pets.service.ts');
    await writeFile(servicePath, 'export class PetsService {}\n', 'utf-8');
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('adds the service to an existing providers array and imports it', async () => {
    const modulePath = path.join(workDir, 'app.module.ts');
    await writeFile(
      modulePath,
      [
        `import { NgModule } from '@angular/core';`,
        '',
        '@NgModule({',
        '  providers: [ExistingService],',
        '})',
        'export class AppModule {}',
        '',
      ].join('\n'),
      'utf-8',
    );

    await wireServiceProvider(modulePath, servicePath, 'PetsService');

    const content = await readFile(modulePath, 'utf-8');
    expect(content).toContain(`import { PetsService } from './pets.service.js';`);
    expect(content).toContain('providers: [ExistingService, PetsService],');
  });

  it('creates a providers array when the decorator has no metadata object', async () => {
    const modulePath = path.join(workDir, 'app.module.ts');
    await writeFile(
      modulePath,
      [`import { NgModule } from '@angular/core';`, '', '@NgModule()', 'export class AppModule {}', ''].join('\n'),
      'utf-8',
    );

    await wireServiceProvider(modulePath, servicePath, 'PetsService');

    const content = await readFile(modulePath, 'utf-8');
    expect(content).toContain('@NgModule({ providers: [PetsService] })');
    expect(content).toContain(`import { PetsService } from './pets.service.js';`);
  });

  it('adds a providers property when the metadata object has none', async () => {
    const modulePath = path.join(workDir, 'app.component.ts');
    await writeFile(
      modulePath,
      [
        `import { Component } from '@angular/core';`,
        '',
        '@Component({',
        `  selector: 'app-root',`,
        '})',
        'export class AppComponent {}',
        '',
      ].join('\n'),
      'utf-8',
    );

    await wireServiceProvider(modulePath, servicePath, 'PetsService');

    const content = await readFile(modulePath, 'utf-8');
    expect(content).toContain('providers: [PetsService]');
  });

  it('is idempotent when the service is already wired', async () => {
    const modulePath = path.join(workDir, 'app.module.ts');
    await writeFile(
      modulePath,
      [
        `import { NgModule } from '@angular/core';`,
        `import { PetsService } from './pets.service.js';`,
        '',
        '@NgModule({',
        '  providers: [PetsService],',
        '})',
        'export class AppModule {}',
        '',
      ].join('\n'),
      'utf-8',
    );

    await wireServiceProvider(modulePath, servicePath, 'PetsService');

    const content = await readFile(modulePath, 'utf-8');
    expect(content.match(/PetsService/g)).toHaveLength(2);
  });

  it('throws a clear error when no supported decorator is found', async () => {
    const modulePath = path.join(workDir, 'plain.ts');
    await writeFile(modulePath, 'export class Plain {}\n', 'utf-8');

    await expect(wireServiceProvider(modulePath, servicePath, 'PetsService')).rejects.toThrow(
      /No @NgModule, @Component, or @Directive class found/,
    );
  });
});
