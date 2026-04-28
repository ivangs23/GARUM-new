/**
 * Devuelve el inicio del día actual en Europe/Madrid, expresado en ISO UTC.
 * Maneja CET/CEST automáticamente vía Intl.
 */
export function startOfTodayMadridIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  const hRaw = get('hour');
  const h = parseInt(hRaw === '24' ? '00' : hRaw, 10);
  const m = parseInt(get('minute'), 10);
  const s = parseInt(get('second'), 10);
  const ms = now.getMilliseconds();

  const elapsedMs = ((h * 60 + m) * 60 + s) * 1000 + ms;
  const todayMidnightUtc = new Date(now.getTime() - elapsedMs);
  return todayMidnightUtc.toISOString();
}

const madridDayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * Devuelve true si `iso` cae en el mismo día Madrid que `now`.
 */
export function isToday(iso: string, now: Date = new Date()): boolean {
  return madridDayFmt.format(new Date(iso)) === madridDayFmt.format(now);
}
