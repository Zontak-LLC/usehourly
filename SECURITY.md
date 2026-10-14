# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Email **admin@zontakllc.com** with:

- what you found and where,
- steps to reproduce it,
- the impact you think it has.

You will get a reply within a few days. Please give us reasonable time to fix the problem before
you share it publicly.

## What is in scope

The app at https://usehourly.app and the code in this repository: sign-in, per-user data isolation,
invoices and exports.

## What is out of scope

- Findings that need a signed-in user to attack their own account.
- Missing rate limits on sign-in and register (known, tracked in CLAUDE.md under "Not yet built").
- Automated scanner output with no demonstrated impact.
