// lib/twilio.ts
import Twilio from "twilio";

export function getTwilioClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error("Twilio credentials missing: TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN");
  }
  return Twilio(sid, token);
}

export function getTwilioSender() {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM;
  if (messagingServiceSid) return { messagingServiceSid };
  if (from) return { from };
  throw new Error("Twilio sender missing: set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM");
}
