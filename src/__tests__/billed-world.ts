import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

import { fakeD1 } from "./helpers/fake-d1";

/**
 * One billed day (entry e2 on invoice INV-2026-004) on the real Prisma client over a migrated SQLite, with a second
 * user u2 who owns nothing. Resume and bulkSet insert with raw SQL, so these journeys need a real database.
 */
export function sqliteWorld(billedMinutes = 120) {
  const { db, DB } = fakeD1();
  const prisma = new PrismaClient({ adapter: new PrismaD1(DB as never) });
  db.exec(
    `INSERT INTO auth_users (id, name, email, password_hash) VALUES ('u1', 'Jo', 'jo@x.invalid', 'x');
     INSERT INTO auth_users (id, name, email, password_hash) VALUES ('u2', 'Al', 'al@x.invalid', 'x');
     INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme');
     INSERT INTO projects (id, user_id, client_id, name, hourly_rate, billable) VALUES ('p1', 'u1', 'c1', 'Website', 10000, 1);
     INSERT INTO invoices (id, user_id, client_id, client_name, number, issue_date, period_from, period_to,
       total_minutes, total_cents, snapshot, search_text)
       VALUES ('inv1', 'u1', 'c1', 'Acme', 'INV-2026-004', '2026-11-01', '2026-10-03', '2026-10-03', ${billedMinutes}, 20000, '{}', '');
     INSERT INTO time_entries (id, user_id, project_id, date, minutes, note, invoice_id, created_at, updated_at)
       VALUES ('e2', 'u1', 'p1', '2026-10-03', ${billedMinutes}, 'nav', 'inv1', '2026-10-03T10:00:00.000Z', '2026-10-03T10:00:00.000Z');`,
  );
  const callerFor = (userId: string) =>
    createCallerFactory(appRouter)({ prisma, session: { user: { id: userId }, expires: "" } } as never);
  const c = callerFor("u1");
  const row = (id = "e2") => prisma.timeEntry.findUniqueOrThrow({ where: { id } });
  return { db, prisma, c, callerFor, row };
}
