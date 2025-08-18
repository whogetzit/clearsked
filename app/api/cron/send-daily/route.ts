// inside app/api/cron/send-daily/route.ts where you load subscribers:
const baseSelect = {
  phoneE164: true,
  active: true,
  zip: true,
  latitude: true,
  longitude: true,
  durationMin: true,
  createdAt: true,
  lastSentAt: true,
  prefs: true, // derive timeZone & deliveryHourLocal from here
} as const;

let subs: any[] = [];
if (onlyPhone) {
  subs = await prisma.subscriber.findMany({
    where: { phoneE164: onlyPhone, active: true },
    take: 1,
    select: baseSelect,
  });
} else {
  subs = await prisma.subscriber.findMany({
    where: { active: true },
    select: baseSelect,
  });
}

// later, derive from prefs JSON:
const p = s.prefs ?? {};
const tz: string = p.timeZone ?? 'America/Chicago';
const deliveryHourLocal: number | undefined = p.deliveryHourLocal ?? undefined;
