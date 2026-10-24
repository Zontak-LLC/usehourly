-- How often a client is invoiced (2026-10-24, issue 100, "get paid without chasing"): null = when the freelancer
-- chooses (as before), 'month' = on the 1st for the previous calendar month, '2weeks' = every 14 days from
-- invoice_anchor (YYYY-MM-DD, the first day of the first period). Additive and nullable: old code never reads them.
ALTER TABLE "clients" ADD COLUMN "invoice_every" TEXT;
ALTER TABLE "clients" ADD COLUMN "invoice_anchor" TEXT;
