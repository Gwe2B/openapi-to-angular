import ts from 'typescript';

/** Extracts the free-text description from a node's leading `/** ... *\/` comment, dropping any `@tag` lines. */
export function getJsDocDescription(sourceFile: ts.SourceFile, node: ts.Node): string | undefined {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges) {
    return undefined;
  }

  const jsDocRange = ranges.find((range) => fullText.slice(range.pos, range.pos + 3) === '/**');
  if (!jsDocRange) {
    return undefined;
  }

  const raw = fullText.slice(jsDocRange.pos, jsDocRange.end);
  const lines = raw
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*\s?/, '').trimEnd());

  const descriptionLines: string[] = [];
  for (const line of lines) {
    if (/^@\w+/.test(line.trim())) break;
    descriptionLines.push(line);
  }

  const description = descriptionLines.join('\n').trim();
  return description.length > 0 ? description : undefined;
}
