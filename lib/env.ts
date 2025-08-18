// lib/env.ts
import "server-only";
import { z } from "zod";

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url(),

  WEATHERKIT_TEAM_ID: z.string().min(1),
  WEATHERKIT_SERVICE_ID: z.string().min(1),
  WEATHERKIT_KEY_ID: z.string().min(1),
  WEATHERKIT_P8_BASE64: z.string().min(1),

  TWILIO_ACCOUNT_SID: z.string().startsWith("AC").optional(),
  TWILIO_AUTH_TOKEN: z.string().min(10).optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().startsWith("MG").optional(),
  TWILIO_FROM: z.string().optional(),

  CRON_SECRET: z.string().optional(),
  ADMIN_TOKEN: z.string().optional(),
  ALLOW_MANUAL_PHONE: z.string().optional(),
});

export const env = Schema.parse(process.env);

export function assertTwilioSendReady() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio creds missing");
  }
  if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM) {
    throw new Error("Twilio sender missing (set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM)");
  }
}
