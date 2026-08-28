import { describe, expect, it } from 'vitest';
import { createProgram } from './cli.js';

describe('createProgram', () => {
  it('registers the generate command', () => {
    const program = createProgram();
    const generate = program.commands.find((cmd) => cmd.name() === 'generate');
    expect(generate).toBeDefined();
  });

  it('registers the extract command', () => {
    const program = createProgram();
    const extract = program.commands.find((cmd) => cmd.name() === 'extract');
    expect(extract).toBeDefined();
  });
});
