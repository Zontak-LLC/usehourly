import { z } from "zod";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** An email address as typed into a form: trimmed, lowercased, and no longer than the 254 characters email allows. */
export const emailField = z.string().trim().toLowerCase().max(254, "That email address is too long.").email();
