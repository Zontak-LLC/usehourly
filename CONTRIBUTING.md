# Contributing to UseHourly

Thanks for your interest. Bug reports and small, focused pull requests are welcome.

## Set up

See the "Run it locally" section of the [README](README.md): `npm install`, `npm run d1:migrate:local`, `npm run dev`.

## Before you open a pull request

```bash
npm run ci           # Biome (lint and format), tsc, then all tests with the coverage floor: exactly what CI runs
npm run e2e          # browser tests (desktop and phone); run it when you change a screen
```

Pull requests to `main` run the same `npm run ci` on GitHub Actions, plus CodeQL and a dependency review. Fill in the
checklist in the pull request template. If you add or change a dependency, `npm run audit:prod` must still pass.

## Guidelines

- **Tests describe user journeys**, not single functions. See `src/__tests__` for the style: each file walks a whole flow and checks concrete values.
- **Keep it simple.** The product's promise is that logging a day takes seconds. Changes that add clicks or screens need a good reason.
- **Plain words in the interface.** No jargon, and every control has a visible label.
- **Test the failure, not only the happy path.** Wrong input, a refused email, a timed-out service, someone else's id: each needs a scenario. Coverage has a floor in `vitest.config.ts`; a change that adds untested code can fail it.
- **Log errors with `logError`** from `src/lib/log.ts` (one JSON line with a stable event name), never `console.error` with free text, and never put a password, token or whole request in a log line.
- **Migrations must work with both the old and the new code**, so a deploy can be rolled back safely. See `docs/operations.md`.
- **Never commit secrets.** `.env*.local`, `.dev.vars` and `.wrangler` are git-ignored; keep it that way.

## How the project is run

See [docs/operations.md](docs/operations.md) for how it is deployed, monitored and rolled back, and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
for how we treat each other.

## Reporting a security problem

Please do not open a public issue. Email **admin@zontakllc.com** with the details.
