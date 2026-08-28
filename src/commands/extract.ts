import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import yaml from 'js-yaml';
import { extractOpenApiDocument } from '../extractor/openapi-builder.js';

interface ExtractOptions {
  output: string;
  title?: string;
  apiVersion?: string;
  format?: 'yaml' | 'json';
}

export function registerExtractCommand(program: Command): void {
  program
    .command('extract')
    .summary('Generate an OpenAPI spec from Angular service(s)')
    .description(
      [
        'Reverse of "generate": read one or more Angular HttpClient service files and emit an OpenAPI (3.x) document.',
        '',
        'Each method that issues an HttpClient call (this.http.get/post/put/patch/delete/...) becomes an operation; ' +
          'methods that never call HttpClient are skipped. A leading TSDoc comment on a method becomes its operation ' +
          "description. Types referenced by path/query parameters, request bodies, and response bodies are resolved " +
          '(including through imported model files) into "components.schemas".',
      ].join('\n'),
    )
    .argument('<services...>', 'path(s) to Angular service TypeScript file(s)')
    .option('-o, --output <file>', 'output path for the generated OpenAPI document', 'openapi.yaml')
    .option('--title <title>', "value for the spec's info.title (default: derived from the first service's class name)")
    .option('--api-version <version>', "value for the spec's info.version", '1.0.0')
    .option('--format <format>', "output format, 'yaml' or 'json' (default: inferred from --output's extension)")
    .addHelpText(
      'after',
      `
Examples:
  $ openapi-to-angular extract ./src/app/api/petstore.service.ts
  $ openapi-to-angular extract ./petstore.service.ts ./users.service.ts -o ./openapi.json
  $ openapi-to-angular extract ./petstore.service.ts --title "Petstore API" --api-version 2.0.0
`,
    )
    .action(async (services: string[], options: ExtractOptions) => {
      const doc = await extractOpenApiDocument(services, {
        title: options.title,
        apiVersion: options.apiVersion,
      });

      const outputPath = path.resolve(process.cwd(), options.output);
      const format = options.format ?? (outputPath.endsWith('.json') ? 'json' : 'yaml');
      const content = format === 'json' ? `${JSON.stringify(doc, null, 2)}\n` : yaml.dump(doc, { noRefs: true });

      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, content, 'utf-8');

      console.log(`Extracted OpenAPI spec to ${path.relative(process.cwd(), outputPath)}`);
    });
}
