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
- `--decorator <type>` — decorator style for the generated service: `injectable` (default) emits `@Injectable({ providedIn: ... })`; `service` emits `@Service()`. Mutually exclusive with `--providedIn`.
- `--providedIn <value>` — value for the `@Injectable` `providedIn` option (default: `root`). Pass `null` for the literal `null`, or any other string (e.g. `platform`, `any`). Only applies when `--decorator` is `injectable`.
- `--injection <pattern>` — dependency injection pattern for the generated service: `inject` (default) uses Angular's `inject()` function; `constructor` uses constructor-parameter injection.
- `-M, --module <path>` — add the generated service to the `providers` array of the `@NgModule`/`@Component`/`@Directive` class found in this file, adding the import if needed. The file is edited in place.
- `--no-doc` — do not emit a TSDoc comment above each generated method from the operation's OpenAPI `description` (TSDoc comments are emitted by default).
- `--visibility` — add an explicit `public` modifier to generated methods, which TypeScript otherwise treats as implicit (default: off).

For each `components.schemas` entry, a TypeScript model file is generated in the models folder (plus a barrel `index.ts`). One Angular service is generated at the workspace root, with one method per OpenAPI operation, typed against the generated models and using `HttpClient`.

### Reverse: `extract`

```bash
openapi-to-angular extract <services...> [options]
```

The opposite of `generate`: reads one or more Angular `HttpClient` service files and writes out an OpenAPI (3.x)
document. A method becomes an operation only if it actually calls `HttpClient` (`this.http.get/post/put/patch/delete/...`);
methods that don't (private helpers, computed getters, etc.) are skipped. A leading TSDoc comment on a method becomes
that operation's `description`. Types used for path/query parameters, request bodies, and response bodies are resolved
into `components.schemas`, following relative imports into model files.

- `<services...>` — one or more paths to Angular service `.ts` files
- `-o, --output <file>` — output path for the generated spec (default: `openapi.yaml`)
- `--title <title>` — `info.title` (default: derived from the first service's class name)
- `--api-version <version>` — `info.version` (default: `1.0.0`)
- `--format <format>` — `yaml` or `json` (default: inferred from `--output`'s extension)

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
