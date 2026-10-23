# Example invoice

`example-invoice.pdf` (and its first-page preview `example-invoice.webp`) is shown beside the forms that fill in an
invoice (Account > Business details, Clients > Billing details). It is made by UseHourly's own PDF code for an invented
freelancer (Okafor Design Studio, Maya Okafor) and client (Northwind Coffee). Every number in it is clearly fake.

To remake it (for example after the PDF layout changes):

1. Draw the logo: `node scripts/example-invoice/logo.mjs /tmp/logo.png`
2. Copy `scripts/example-invoice/make-example-invoice.test.ts` into `src/__tests__/`, run
   `LOGO_PATH=/tmp/logo.png npx vitest run src/__tests__/make-example-invoice.test.ts`, then delete the copy.
3. Preview: `pdftoppm -r 150 -png -f 1 -l 1 public/examples/example-invoice.pdf /tmp/hi && cwebp -resize 900 0 -q 82 /tmp/hi-1.png -o public/examples/example-invoice.webp`
