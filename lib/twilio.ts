// lib/twilio.ts
type TwilioClient = {
  messages: {
    create: (opts: {
      to: string;
      body: string;
      messagingServiceSid?: string;
      from?: string;
      mediaUrl?: string[]; // <-- allow MMS
    }) => Promise<any>;
  };
};

let client: TwilioClient | null = null;

export function getTwilioClient(): TwilioClient | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  if (!client) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const tw = require('twilio');
    client = tw(sid, token);
  }
  return client;
}

/**
 * Send an SMS (optionally MMS) message.
 * Pass a single image URL as `mediaUrl` or an array of URLs.
 */
export async function sendSms(
  to: string,
  body: string,
  mediaUrl?: string | string[],
) {
  const cl = getTwilioClient();
  if (!cl) throw new Error('twilio: Twilio credentials missing: TWILIO_ACCOUNT_SID and/or TWILIO_AUTH_TOKEN');

  const mss = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM;
  if (!mss && !from) throw new Error('twilio: missing TWILIO_FROM or TWILIO_MESSAGING_SERVICE_SID');

  const opts: any = mss ? { to, body, messagingServiceSid: mss } : { to, body, from };
  if (mediaUrl) {
    opts.mediaUrl = Array.isArray(mediaUrl) ? mediaUrl : [mediaUrl];
  }
  return cl.messages.create(opts);
}
