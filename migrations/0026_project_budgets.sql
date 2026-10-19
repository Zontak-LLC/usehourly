-- An optional budget per project: an amount in minutes (unit "hours") or cents (unit "dollars"), per calendar month
-- or for the whole project. Null amount = no budget. Existing projects keep no budget.
ALTER TABLE "projects" ADD COLUMN "budget_amount" INTEGER;
ALTER TABLE "projects" ADD COLUMN "budget_unit" TEXT;
ALTER TABLE "projects" ADD COLUMN "budget_period" TEXT NOT NULL DEFAULT 'month';
