import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { buildModelRegistry } from '../generator/model-registry.js';
import { generateModels } from '../generator/model-generator.js';
import { generateService } from '../generator/service-generator.js';
import { loadOpenApiDocument } from '../openapi/load.js';
import { toKebabCase, toPascalCase } from '../utils/naming.js';

interface GenerateOptions {
  ws: string;
  serviceName?: string;
  modelsFolder: string;
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate an Angular service and models from an OpenAPI spec')
    .argument('<input>', 'path or URL to the OpenAPI spec')
    .option('-w, --ws <dir>', 'workspace root for the generated files and folders', '.')
    .option('-s, --service-name <name>', 'Angular service class name')
    .option('-m, --models-folder <dir>', 'output folder for generated models, relative to --ws', 'models')
    .action(async (input: string, options: GenerateOptions) => {
      const doc = await loadOpenApiDocument(input);

      const wsDir = path.resolve(process.cwd(), options.ws);
      const modelsDir = path.resolve(wsDir, options.modelsFolder);

      const baseName = options.serviceName ?? doc.info?.title ?? path.basename(input, path.extname(input));
      const pascalBase = toPascalCase(baseName);
      const className = pascalBase.endsWith('Service') ? pascalBase : `${pascalBase}Service`;
      const serviceFileName = `${toKebabCase(className.replace(/Service$/, ''))}.service.ts`;
      const serviceFilePath = path.join(wsDir, serviceFileName);

      await mkdir(wsDir, { recursive: true });

      const models = await generateModels(doc, modelsDir);
      const modelRegistry = buildModelRegistry(doc);
      await generateService(doc, {
        className,
        filePath: serviceFilePath,
        modelsDir,
        modelRegistry,
      });

      console.log(`Generated ${models.length} model(s) in ${path.relative(process.cwd(), modelsDir)}`);
      console.log(`Generated ${className} at ${path.relative(process.cwd(), serviceFilePath)}`);
    });
}
