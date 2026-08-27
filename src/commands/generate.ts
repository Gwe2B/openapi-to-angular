import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { buildModelRegistry } from '../generator/model-registry.js';
import { generateModels } from '../generator/model-generator.js';
import type { InjectableConfig } from '../generator/service-generator.js';
import { generateService } from '../generator/service-generator.js';
import { wireServiceProvider } from '../generator/wire-module.js';
import { loadOpenApiDocument } from '../openapi/load.js';
import { toKebabCase, toPascalCase } from '../utils/naming.js';

interface GenerateOptions {
  ws: string;
  serviceName?: string;
  modelsFolder: string;
  service?: boolean;
  providedIn?: string;
  module?: string;
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate an Angular service and models from an OpenAPI spec')
    .argument('<input>', 'path or URL to the OpenAPI spec')
    .option('-w, --ws <dir>', 'workspace root for the generated files and folders', '.')
    .option('-s, --service-name <name>', 'Angular service class name')
    .option('-m, --models-folder <dir>', 'output folder for generated models, relative to --ws', 'models')
    .option('--service', 'use a bare @Injectable() decorator instead of @Injectable({ providedIn: \'root\' })')
    .option(
      '--providedIn <value>',
      "value for the @Injectable providedIn option (e.g. 'root', 'platform', 'any', or 'null')",
    )
    .option(
      '-M, --module <path>',
      'add the generated service to the providers array of this module/component/directive file',
    )
    .action(async (input: string, options: GenerateOptions) => {
      if (options.service && options.providedIn !== undefined) {
        throw new Error('Options --service and --providedIn cannot be used together.');
      }

      const doc = await loadOpenApiDocument(input);

      const wsDir = path.resolve(process.cwd(), options.ws);
      const modelsDir = path.resolve(wsDir, options.modelsFolder);

      const baseName = options.serviceName ?? doc.info?.title ?? path.basename(input, path.extname(input));
      const pascalBase = toPascalCase(baseName);
      const className = pascalBase.endsWith('Service') ? pascalBase : `${pascalBase}Service`;
      const serviceFileName = `${toKebabCase(className.replace(/Service$/, ''))}.service.ts`;
      const serviceFilePath = path.join(wsDir, serviceFileName);

      const injectable: InjectableConfig = options.service
        ? { kind: 'bare' }
        : { kind: 'providedIn', value: parseProvidedIn(options.providedIn) };

      await mkdir(wsDir, { recursive: true });

      const models = await generateModels(doc, modelsDir);
      const modelRegistry = buildModelRegistry(doc);
      await generateService(doc, {
        className,
        filePath: serviceFilePath,
        modelsDir,
        modelRegistry,
        injectable,
      });

      console.log(`Generated ${models.length} model(s) in ${path.relative(process.cwd(), modelsDir)}`);
      console.log(`Generated ${className} at ${path.relative(process.cwd(), serviceFilePath)}`);

      if (options.module) {
        const modulePath = path.resolve(process.cwd(), options.module);
        await wireServiceProvider(modulePath, serviceFilePath, className);
        console.log(`Added ${className} to providers in ${path.relative(process.cwd(), modulePath)}`);
      }
    });
}

function parseProvidedIn(value: string | undefined): string | null {
  if (value === undefined) {
    return 'root';
  }
  return value === 'null' ? null : value;
}
