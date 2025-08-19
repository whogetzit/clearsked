// app/api/version/route.ts
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  // These are set by Vercel automatically on deploys
  const commit = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const branch = process.env.VERCEL_GIT_COMMIT_REF || null;
  const repo = process.env.VERCEL_GIT_REPO_SLUG || null;
  const project = process.env.VERCEL_PROJECT_PRODUCTION_URL || null;

  // DO NOT expose secrets; only presence checks for the common ones
  const envPresent = {
    ADMIN_TOKEN: !!(process.env.ADMIN_TOKEN || '').trim(),
    CRON_SECRET: !!(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || '').trim(),
    TWILIO_ACCOUNT_SID: !!(process.env.TWILIO_ACCOUNT_SID || '').trim(),
    TWILIO_AUTH_TOKEN: !!(process.env.TWILIO_AUTH_TOKEN || '').trim(),
    TWILIO_FROM_NUMBER: !!(process.env.TWILIO_FROM_NUMBER || '').trim(),
    TWILIO_MESSAGING_SERVICE_SID: !!(process.env.TWILIO_MESSAGING_SERVICE_SID || '').trim(),
  };

  return NextResponse.json({
    ok: true,
    commit,
    branch,
    repo,
    project,
    envPresent,
    now: new Date().toISOString(),
  });
}
