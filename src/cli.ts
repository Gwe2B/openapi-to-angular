import { Command } from 'commander';
import { registerExtractCommand } from './commands/extract.js';
import { registerGenerateCommand } from './commands/generate.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('openapi-to-angular')
    .description('Generate Angular code from an OpenAPI specification')
    .version('0.1.0');

  registerGenerateCommand(program);
  registerExtractCommand(program);

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  await createProgram().parseAsync(argv);
}
