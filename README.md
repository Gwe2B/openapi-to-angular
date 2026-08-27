# openapi-to-angular

CLI to generate Angular code from an OpenAPI specification.

## Development

```bash
npm install
npm run dev -- generate ./spec.yaml --ws ./generated
```

## Scripts

- `npm run dev` — run the CLI from source with `tsx`
- `npm run build` — bundle to `dist/` with `tsup`
- `npm start` — run the built CLI
- `npm run typecheck` — type-check without emitting
- `npm run lint` / `npm run lint:fix` — lint with ESLint
- `npm test` / `npm run test:watch` — run tests with Vitest

## Usage

```bash
openapi-to-angular generate <input> [-w, --ws <dir>] [-s, --service-name <name>] [-m, --models-folder <dir>]
```

`<input>` is a path or URL to an OpenAPI (3.x) JSON or YAML document.

- `-w, --ws <dir>` — workspace root for all generated files and folders (default: `.`)
- `-s, --service-name <name>` — Angular service class name (default: derived from the spec's `info.title`, falling back to the input file name); a `Service` suffix is appended if missing
- `-m, --models-folder <dir>` — output folder for generated models, relative to `--ws` (default: `models`)

For each `components.schemas` entry, a TypeScript model file is generated in the models folder (plus a barrel `index.ts`). One Angular `@Injectable` service is generated at the workspace root, with one method per OpenAPI operation, typed against the generated models and using `HttpClient`.
