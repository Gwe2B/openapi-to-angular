import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Command, Option } from 'commander';
import { buildModelRegistry } from '../generator/model-registry.js';
import { generateModels } from '../generator/model-generator.js';
import type { InjectableConfig, InjectionPattern } from '../generator/service-generator.js';
import { generateService } from '../generator/service-generator.js';
import { wireServiceProvider } from '../generator/wire-module.js';
import { loadOpenApiDocument } from '../openapi/load.js';
import { toKebabCase, toPascalCase } from '../utils/naming.js';

interface GenerateOptions {
  ws: string;
  serviceName?: string;
  modelsFolder: string;
  decorator: 'injectable' | 'service';
  providedIn?: string;
  injection: InjectionPattern;
  module?: string;
  doc: boolean;
  visibility: boolean;
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .summary('Generate an Angular service and models from an OpenAPI spec')
    .description(
      [
        'Generate an Angular HttpClient service and TypeScript models from an OpenAPI (3.x) spec.',
        '',
        'One TypeScript model file is written per "components.schemas" entry (plus a barrel index.ts), and a single Angular service class is written with one method per OpenAPI operation, typed against the generated models.',
      ].join('\n'),
    )
    .argument('<input>', 'path or URL to the OpenAPI spec (JSON or YAML)')
    .option('-w, --ws <dir>', 'workspace root where all generated files and folders are written', '.')
    .option(
      '-s, --service-name <name>',
      "Angular service class name (default: derived from the spec's info.title, " +
        "or the input file name; a 'Service' suffix is appended automatically if missing)",
    )
    .option(
      '-m, --models-folder <dir>',
      'folder for generated model files, relative to --ws (a barrel index.ts is also written there)',
      'models',
    )
    .addOption(
      new Option(
        '--decorator <type>',
        "decorator style for the generated service: 'injectable' emits @Injectable({ providedIn: ... }); " +
          "'service' emits @Service(). Cannot be combined with --providedIn",
      )
        .choices(['injectable', 'service'])
        .default('injectable'),
    )
    .option(
      '--providedIn <value>',
      "value passed to @Injectable's providedIn option: 'root' (default), 'platform', 'any', " +
        "any other string, or the literal 'null'. Only applies when --decorator is 'injectable'; " +
        "cannot be combined with --decorator service",
    )
    .addOption(
      new Option(
        '--injection <pattern>',
        "dependency injection pattern for the generated service: 'inject' uses Angular's inject() " +
          "function (default); 'constructor' uses constructor-parameter injection",
      )
        .choices(['constructor', 'inject'])
        .default('inject'),
    )
    .option(
      '-M, --module <path>',
      'path to an existing @NgModule/@Component/@Directive file; the generated service is added ' +
        'to its providers array (and imported) in place',
    )
    .option(
      '--no-doc',
      "do not emit a TSDoc comment above each generated method from the operation's OpenAPI description",
    )
    .option(
      '--visibility',
      "add an explicit 'public' modifier to generated methods (TypeScript treats it as implicit otherwise)",
      false,
    )
    .addHelpText(
      'after',
      `
Examples:
  $ openapi-to-angular generate ./spec.yaml
  $ openapi-to-angular generate ./spec.yaml --ws ./src/app/api -s PetStore -m models
  $ openapi-to-angular generate https://api.example.com/openapi.json --providedIn platform
  $ openapi-to-angular generate ./spec.yaml --decorator service
  $ openapi-to-angular generate ./spec.yaml --injection constructor
  $ openapi-to-angular generate ./spec.yaml --no-doc --visibility

Notes:
  - <input> may be a local file path or an http(s) URL, in JSON or YAML.
  - --decorator service and --providedIn are mutually exclusive.
  - --module supports @NgModule, @Component, and @Directive targets (not @Pipe, which
    has no "providers" metadata field in Angular).
`,
    )
    .action(async (input: string, options: GenerateOptions) => {
      if (options.decorator === 'service' && options.providedIn !== undefined) {
        throw new Error('Options --decorator service and --providedIn cannot be used together.');
      }

      const doc = await loadOpenApiDocument(input);

      const wsDir = path.resolve(process.cwd(), options.ws);
      const modelsDir = path.resolve(wsDir, options.modelsFolder);

      const baseName = options.serviceName ?? doc.info?.title ?? path.basename(input, path.extname(input));
      const pascalBase = toPascalCase(baseName);
      const className = pascalBase.endsWith('Service') ? pascalBase : `${pascalBase}Service`;
      const serviceFileName = `${toKebabCase(className.replace(/Service$/, ''))}.service.ts`;
      const serviceFilePath = path.join(wsDir, serviceFileName);

      const injectable: InjectableConfig =
        options.decorator === 'service'
          ? { kind: 'service' }
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
        injectionPattern: options.injection,
        doc: options.doc,
        visibility: options.visibility,
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
