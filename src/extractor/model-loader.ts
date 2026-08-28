import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { SchemaContext } from './type-to-schema.js';

const CANDIDATE_SUFFIXES = ['.ts', '.tsx', '/index.ts', '/index.tsx', ''];

/** Resolves a relative import/export specifier to an existing source file, trying common TS conventions. */
export function resolveModulePath(fromFile: string, spec: string): string | undefined {
  const withoutExt = spec.replace(/\.jsx?$/, '');
  const base = path.resolve(path.dirname(fromFile), withoutExt);
  return CANDIDATE_SUFFIXES.map((suffix) => `${base}${suffix}`).find((candidate) => existsSync(candidate));
}

/**
 * Parses a TS file and registers every exported interface/type alias it declares into `ctx.typeSources`,
 * following relative imports and barrel `export *` re-exports so model files split across a folder all resolve.
 */
export function loadTypeSourcesFromSpec(spec: string, fromFile: string, ctx: SchemaContext, visited: Set<string>): void {
  const resolved = resolveModulePath(fromFile, spec);
  if (!resolved) {
    ctx.warnings.push(`Could not resolve import "${spec}" from "${path.relative(process.cwd(), fromFile)}".`);
    return;
  }
  loadTypeSourcesFromFile(resolved, ctx, visited);
}

function loadTypeSourcesFromFile(filePath: string, ctx: SchemaContext, visited: Set<string>): void {
  const absolute = path.resolve(filePath);
  if (visited.has(absolute)) {
    return;
  }
  visited.add(absolute);

  const text = readFileSync(absolute, 'utf-8');
  const sourceFile = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) && statement.name) {
      ctx.typeSources.set(statement.name.text, { node: statement });
    } else if (ts.isTypeAliasDeclaration(statement) && statement.name) {
      ctx.typeSources.set(statement.name.text, { node: statement });
    } else if (
      (ts.isExportDeclaration(statement) || ts.isImportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.')
    ) {
      loadTypeSourcesFromSpec(statement.moduleSpecifier.text, absolute, ctx, visited);
    }
  }
}
