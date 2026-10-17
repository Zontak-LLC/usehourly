# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Email **admin@zontakllc.com** with:

- what you found and where,
- steps to reproduce it,
- the impact you think it has.

You will get a reply within a few days. Please give us reasonable time to fix the problem before
you share it publicly. If you act in good faith (no access to other people's data beyond what is
needed to show the problem, no disruption of the service), we will not take action against you.
The same contact is published at https://usehourly.app/.well-known/security.txt.

## What is in scope

The app at https://usehourly.app and the code in this repository: sign-in, per-user data isolation,
invoices and exports.

## What is out of scope

- Findings that need a signed-in user to attack their own account.
- Denial of service by sheer traffic volume (Cloudflare sits in front); but a way for one account to use
  up shared resources is in scope.
- Automated scanner output with no demonstrated impact.
