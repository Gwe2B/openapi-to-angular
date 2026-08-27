import { Command } from 'commander';
import { registerGenerateCommand } from './commands/generate.js';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('openapi-to-angular')
    .description('Generate Angular code from an OpenAPI specification')
    .version('0.1.0');

  registerGenerateCommand(program);

  return program;
}

export function runCli(argv: string[]): void {
  createProgram().parse(argv);
}
