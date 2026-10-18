## What and why

<!-- One or two sentences: what changes for the person using UseHourly, and why. Link the issue (Fixes #123). -->

## How it was checked

- [ ] `npm run ci` passes (Biome, types, tests with the coverage floor)
- [ ] New behaviour has a scenario test (a whole user journey, not a single function), including the failure case
- [ ] Anything that touches the screen was looked at on a phone-sized window as well as a desktop one
- [ ] No secrets, personal data or real customer data in the diff, the tests or the screenshots

## If it changes the database or what is stored

- [ ] The migration works with both the old and the new code (see "Going back" in `docs/operations.md`)
- [ ] Account deletion (`src/server/account-deletion.ts`) and the privacy page cover any new user-owned table
