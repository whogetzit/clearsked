// lib/twilio.ts
import "server-only";
import Twilio from "twilio";
import { env, assertTwilioSendReady } from "@/lib/env";

export function getTwilioClient() {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials missing: TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN");
  }
  return Twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
}

export function getTwilioSender() {
  if (env.TWILIO_MESSAGING_SERVICE_SID) {
    return { messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID };
  }
  if (env.TWILIO_FROM) {
    return { from: env.TWILIO_FROM };
  }
  throw new Error("Twilio sender missing: set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM");
}

// Optional one-liner guard you can use before sending
export function ensureTwilioReady() {
  assertTwilioSendReady();
}
