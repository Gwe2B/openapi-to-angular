import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

const SUPPORTED_DECORATORS = new Set(['NgModule', 'Component', 'Directive']);

interface DecoratedTarget {
  decoratorName: string;
  call: ts.CallExpression;
}

interface Edit {
  start: number;
  end: number;
  text: string;
}

/** Adds `serviceClassName` (imported from `serviceFilePath`) to the `providers` array of the
 * first `@NgModule`/`@Component`/`@Directive` class found in `targetFilePath`, editing the file in place. */
export async function wireServiceProvider(
  targetFilePath: string,
  serviceFilePath: string,
  serviceClassName: string,
): Promise<void> {
  const originalText = await readFile(targetFilePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    targetFilePath,
    originalText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const target = findDecoratedClass(sourceFile);
  if (!target) {
    throw new Error(
      `No @NgModule, @Component, or @Directive class found in "${targetFilePath}". Cannot add ${serviceClassName} to its providers.`,
    );
  }

  const edits = [
    buildProvidersEdit(target, serviceClassName),
    buildImportEdit(sourceFile, targetFilePath, serviceFilePath, serviceClassName),
  ].filter((edit): edit is Edit => edit !== null);

  if (edits.length === 0) {
    return;
  }

  await writeFile(targetFilePath, applyEdits(originalText, edits), 'utf-8');
}

function findDecoratedClass(sourceFile: ts.SourceFile): DecoratedTarget | undefined {
  let found: DecoratedTarget | undefined;

  const visit = (node: ts.Node): void => {
    if (found) {
      return;
    }
    if (ts.isClassDeclaration(node) && ts.canHaveDecorators(node)) {
      for (const decorator of ts.getDecorators(node) ?? []) {
        const expression = decorator.expression;
        if (
          ts.isCallExpression(expression) &&
          ts.isIdentifier(expression.expression) &&
          SUPPORTED_DECORATORS.has(expression.expression.text)
        ) {
          found = { decoratorName: expression.expression.text, call: expression };
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function buildProvidersEdit(target: DecoratedTarget, serviceClassName: string): Edit | null {
  const { call } = target;

  if (call.arguments.length === 0) {
    const insertPos = call.arguments.end;
    return { start: insertPos, end: insertPos, text: `{ providers: [${serviceClassName}] }` };
  }

  const metadata = call.arguments[0];
  if (!metadata || !ts.isObjectLiteralExpression(metadata)) {
    throw new Error(
      `Unsupported @${target.decoratorName} metadata: expected an object literal as the first argument.`,
    );
  }

  const providersProp = metadata.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === 'providers',
  );

  if (providersProp) {
    if (!ts.isArrayLiteralExpression(providersProp.initializer)) {
      throw new Error(`Unsupported "providers" value in @${target.decoratorName}: expected an array literal.`);
    }
    const array = providersProp.initializer;
    const alreadyPresent = array.elements.some(
      (element) => ts.isIdentifier(element) && element.text === serviceClassName,
    );
    if (alreadyPresent) {
      return null;
    }
    if (array.elements.length === 0) {
      const insertPos = array.getStart() + 1;
      return { start: insertPos, end: insertPos, text: serviceClassName };
    }
    const lastElement = array.elements[array.elements.length - 1]!;
    return { start: lastElement.getEnd(), end: lastElement.getEnd(), text: `, ${serviceClassName}` };
  }

  if (metadata.properties.length === 0) {
    const insertPos = metadata.getStart() + 1;
    return { start: insertPos, end: insertPos, text: ` providers: [${serviceClassName}] ` };
  }
  const lastProp = metadata.properties[metadata.properties.length - 1]!;
  return { start: lastProp.getEnd(), end: lastProp.getEnd(), text: `,\n  providers: [${serviceClassName}]` };
}

function buildImportEdit(
  sourceFile: ts.SourceFile,
  targetFilePath: string,
  serviceFilePath: string,
  serviceClassName: string,
): Edit | null {
  const alreadyImported = sourceFile.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.some((element) => element.name.text === serviceClassName),
  );

  if (alreadyImported) {
    return null;
  }

  const importPath = toRelativeImportPath(targetFilePath, serviceFilePath);
  const importStatement = `import { ${serviceClassName} } from '${importPath}';`;

  const lastImport = [...sourceFile.statements].reverse().find(ts.isImportDeclaration);
  if (lastImport) {
    const insertPos = lastImport.getEnd();
    return { start: insertPos, end: insertPos, text: `\n${importStatement}` };
  }
  return { start: 0, end: 0, text: `${importStatement}\n\n` };
}

function toRelativeImportPath(fromFile: string, toFile: string): string {
  const relative = path
    .relative(path.dirname(fromFile), toFile)
    .replace(/\.ts$/, '.js')
    .split(path.sep)
    .join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function applyEdits(text: string, edits: Edit[]): string {
  let result = text;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}
