# Contributing to UseHourly

Thanks for your interest. Bug reports and small, focused pull requests are welcome.

## Set up

See the "Run it locally" section of the [README](README.md): `npm install`, `npm run d1:migrate:local`, `npm run dev`.

## Before you open a pull request

```bash
npm test             # all scenario tests must pass
npx biome check src  # lint and format must be clean
npx tsc --noEmit     # no type errors
```

## Guidelines

- **Tests describe user journeys**, not single functions. See `src/__tests__` for the style: each file walks a whole flow and checks concrete values.
- **Keep it simple.** The product's promise is that logging a day takes seconds. Changes that add clicks or screens need a good reason.
- **Plain words in the interface.** No jargon, and every control has a visible label.
- **Never commit secrets.** `.env*.local`, `.dev.vars` and `.wrangler` are git-ignored; keep it that way.

## Reporting a security problem

Please do not open a public issue. Email **admin@zontakllc.com** with the details.
