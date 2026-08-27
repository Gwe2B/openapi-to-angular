# openapi-to-angular

CLI to generate Angular code from an OpenAPI specification.

## Installing

Install straight from a GitHub release tag — no npm registry publish involved. npm clones the
repo, builds it locally (via the `prepare` script), and links the `openapi-to-angular` command:

```bash
npm install -g git+https://github.com/Gwe2B/openapi-to-angular.git#v0.1.0-a1
```

Then run it from anywhere:

```bash
openapi-to-angular generate ./spec.yaml
```

Swap `v0.1.0-a1` for whichever tag you want (see [Releases](https://github.com/Gwe2B/openapi-to-angular/releases)),
or use `#main` to track the latest commit on `main`.

> Some npm setups gate lifecycle scripts (e.g. a corporate `allow-scripts` policy). If the install
> succeeds but `openapi-to-angular` fails with a "Cannot find module" error, the `prepare` build was
> likely blocked — allow it for this package, or run `npm run build` manually after cloning.

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
openapi-to-angular generate <input> [options]
```

`<input>` is a path or URL to an OpenAPI (3.x) JSON or YAML document.

- `-w, --ws <dir>` — workspace root for all generated files and folders (default: `.`)
- `-s, --service-name <name>` — Angular service class name (default: derived from the spec's `info.title`, falling back to the input file name); a `Service` suffix is appended if missing
- `-m, --models-folder <dir>` — output folder for generated models, relative to `--ws` (default: `models`)
- `--service` — use a bare `@Injectable()` decorator instead of `@Injectable({ providedIn: 'root' })`. Mutually exclusive with `--providedIn`.
- `--providedIn <value>` — value for the `@Injectable` `providedIn` option (default: `root`). Pass `null` for the literal `null`, or any other string (e.g. `platform`, `any`).
- `-M, --module <path>` — add the generated service to the `providers` array of the `@NgModule`/`@Component`/`@Directive` class found in this file, adding the import if needed. The file is edited in place.

For each `components.schemas` entry, a TypeScript model file is generated in the models folder (plus a barrel `index.ts`). One Angular service is generated at the workspace root, with one method per OpenAPI operation, typed against the generated models and using `HttpClient`.

## Releasing

No build artifacts to attach, no npm registry — a release is just a tagged commit on `main` plus a
GitHub Release pointing at it:

```bash
npm version patch   # or minor / major — runs lint+typecheck+test first, bumps package.json,
                     # commits "vX.Y.Z", and creates a matching git tag
git push && git push --tags
gh release create vX.Y.Z --title vX.Y.Z --generate-notes
```

That's it — the tag is what people install from (see [Installing](#installing)).
