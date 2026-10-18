import { z } from "zod";

import { defineTool, type McpTool } from "./core";
import { round2, toCents } from "./format";
import { clientRef, dollars, projectRef } from "./inputs";
import { type FlatProject, pickProject, resolveClient, resolveProject } from "./lookup";

export const CLIENT_PROJECT_TOOLS: McpTool[] = [
  // ---- clients and projects
  defineTool({
    name: "create_client",
    title: "Create a client",
    description: "Add a client. Names are unique per account.",
    access: "write",
    input: z.object({
      name: z.string().trim().min(1).max(80).describe("The client's name (unique per account, max 80 characters)"),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional()
        .describe("Hex colour such as #6366f1"),
    }),
    run: async (c, a) => {
      const cl = await c.clients.create(a);
      return { client: { id: cl.id, name: cl.name, color: cl.color } };
    },
  }),

  defineTool({
    name: "update_client",
    title: "Edit a client",
    description:
      "Rename a client or change the legal name and address printed on its invoices. Only the fields you pass change; the logo is kept.",
    access: "write",
    idempotent: true,
    input: z
      .object({
        client: clientRef,
        name: z.string().trim().min(1).max(80).optional().describe("New display name"),
        legal_name: z.string().trim().max(150).optional().describe("Empty string clears it"),
        address: z.string().trim().max(300).optional().describe("Empty string clears it"),
      })
      .refine((v) => [v.name, v.legal_name, v.address].some((x) => x !== undefined), {
        message: "Pass at least one field to change.",
      }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const current = await c.clients.get({ id: cl.id });
      await c.clients.update({
        id: cl.id,
        name: a.name ?? current.name,
        legalName: a.legal_name ?? current.legal_name ?? "",
        address: a.address ?? current.address ?? "",
        logo: current.logo,
      });
      return { ok: true, client: a.name ?? current.name };
    },
  }),

  defineTool({
    name: "archive_client",
    title: "Archive a client",
    description: "Hide a client from the lists. Its time and invoices are kept.",
    access: "write",
    idempotent: true,
    input: z.object({ client: clientRef }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      await c.clients.archive({ id: cl.id });
      return { ok: true, archived: cl.name };
    },
  }),

  defineTool({
    name: "create_project",
    title: "Create a project",
    description: "Add a project under a client, with an hourly rate in dollars and whether it is billable.",
    access: "write",
    input: z.object({
      client: clientRef,
      name: z.string().trim().min(1).max(80).describe("The project's name (max 80 characters)"),
      hourly_rate: dollars.default(0).describe("Dollars per hour, e.g. 85 or 62.5 (default 0)"),
      billable: z.boolean().default(true).describe("Whether the time goes on invoices (default true)"),
    }),
    run: async (c, a) => {
      const cl = await resolveClient(c, a.client);
      const p = await c.project.create({
        clientId: cl.id,
        name: a.name,
        hourlyRate: toCents(a.hourly_rate),
        billable: a.billable,
      });
      return {
        project: {
          id: p.id,
          label: `${cl.name} / ${p.name}`,
          hourly_rate: round2(p.hourly_rate / 100),
          billable: p.billable,
        },
      };
    },
  }),

  defineTool({
    name: "update_project",
    title: "Edit a project",
    description:
      "Rename a project, move it to another client, or change its rate or billable flag. Only the fields you pass change.",
    access: "write",
    idempotent: true,
    input: z
      .object({
        project: projectRef,
        name: z.string().trim().min(1).max(80).optional().describe("New project name"),
        client: clientRef.optional().describe("Move the project to this client"),
        hourly_rate: dollars.optional().describe("New dollars per hour, e.g. 85 or 62.5"),
        billable: z.boolean().optional().describe("Whether the time goes on invoices"),
      })
      .refine((v) => [v.name, v.client, v.hourly_rate, v.billable].some((x) => x !== undefined), {
        message: "Pass at least one field to change.",
      }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      const clientId = a.client ? (await resolveClient(c, a.client)).id : undefined;
      const updated = await c.project.update({
        id: p.id,
        name: a.name,
        clientId,
        hourlyRate: a.hourly_rate === undefined ? undefined : toCents(a.hourly_rate),
        billable: a.billable,
      });
      return {
        project: {
          id: updated.id,
          name: updated.name,
          hourly_rate: round2(updated.hourly_rate / 100),
          billable: updated.billable,
        },
      };
    },
  }),

  defineTool({
    name: "archive_project",
    title: "Archive a project",
    description: "Hide a project from the lists. Its time and invoices are kept.",
    access: "write",
    idempotent: true,
    input: z.object({ project: projectRef }),
    run: async (c, a) => {
      const p = await resolveProject(c, a.project);
      await c.project.archive({ id: p.id });
      return { ok: true, archived: p.label };
    },
  }),

  defineTool({
    name: "unarchive_project",
    title: "Restore a project",
    description: "Bring an archived project (and its client, if archived) back.",
    access: "write",
    idempotent: true,
    input: z.object({ project: projectRef.describe('Archived project id or "Client / Project"') }),
    run: async (c, a) => {
      const archived = (await c.project.listArchived()).map(
        (p): FlatProject => ({
          id: p.id,
          name: p.name,
          client_id: p.client.id,
          client: p.client.name,
          label: `${p.client.name} / ${p.name}`,
          hourly_rate: round2(p.hourly_rate / 100),
          hourly_rate_cents: p.hourly_rate,
          billable: p.billable,
        }),
      );
      const p = pickProject(archived, a.project, "archived project");
      await c.project.unarchive({ id: p.id });
      return { ok: true, restored: p.label };
    },
  }),
];
