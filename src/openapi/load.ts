import { readFile } from 'node:fs/promises';
import yaml from 'js-yaml';
import type { OpenApiDocument } from './types.js';

export async function loadOpenApiDocument(input: string): Promise<OpenApiDocument> {
  const raw = await readSource(input);
  return parseSource(raw);
}

async function readSource(input: string): Promise<string> {
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec from "${input}": ${response.status} ${response.statusText}`,
      );
    }
    return response.text();
  }
  return readFile(input, 'utf-8');
}

function parseSource(raw: string): OpenApiDocument {
  try {
    return JSON.parse(raw) as OpenApiDocument;
  } catch {
    return yaml.load(raw) as OpenApiDocument;
  }
}
