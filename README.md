# openapi-to-angular

CLI to generate Angular code from an OpenAPI specification.

## Development

```bash
npm install
npm run dev -- generate ./spec.yaml -o ./generated
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
openapi-to-angular generate <input> [-o, --output <dir>]
```
