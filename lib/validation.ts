import { z } from "zod";

export const emailSchema = z.string().email("Invalid email address");

export const phoneSchema = z.string().regex(
  /^\+[1-9]\d{1,14}$/,
  "Phone must be in international format (e.g., +447700900123)"
);

export const amountSchema = z
  .number()
  .min(100, "Amount must be at least £1")
  .max(1000000, "Amount cannot exceed £10,000");

export const uuidSchema = z.string().uuid("Invalid ID format");

export const teamNameSchema = z
  .string()
  .min(2, "Team name must be at least 2 characters")
  .max(100, "Team name cannot exceed 100 characters")
  .trim();

// Old single reminder schema (you can keep it, but the new API uses bulkReminderSchema)
export const reminderSchema = z.object({
  teamId: uuidSchema,
  membershipId: uuidSchema,
  message: z.string().max(500, "Message too long").optional(),
});

// ✅ Updated: no duplicated teamId inside target
export const bulkReminderSchema = z.object({
  teamId: uuidSchema,
  message: z.string().max(500, "Message too long").optional().default(""),
  kind: z.enum(["manual", "auto"]).default("manual"),
  target: z.union([
    z.object({ mode: z.literal("single"), membershipId: uuidSchema }),
    z.object({ mode: z.literal("unpaid") }),
    z.object({ mode: z.literal("due_soon"), days: z.number().min(1).max(30) }),
  ]),
});

export const markPaidSchema = z.object({
  teamId: uuidSchema,
  playerId: uuidSchema,
  amount: amountSchema,
  currency: z.enum(["gbp", "usd", "eur"]),
  note: z.string().max(200, "Note too long").optional(),
});

export const rotateTokenSchema = z.object({
  teamId: uuidSchema,
});

export const getTokenSchema = z.object({
  teamId: uuidSchema,
});
