import { Command } from 'commander';

interface GenerateOptions {
  output: string;
}

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate Angular code from an OpenAPI spec')
    .argument('<input>', 'path or URL to the OpenAPI spec')
    .option('-o, --output <dir>', 'output directory', './generated')
    .action((input: string, options: GenerateOptions) => {
      console.log(`Generating Angular code from "${input}" into "${options.output}"...`);
      // TODO: implement OpenAPI parsing and Angular code generation
    });
}
