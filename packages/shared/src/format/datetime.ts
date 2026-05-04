/**
 * Devuelve el inicio del día actual en Europe/Madrid, expresado en ISO UTC.
 * Maneja CET/CEST automáticamente vía Intl.
 */
export function startOfTodayMadridIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const hRaw = get("hour");
  const h = parseInt(hRaw === "24" ? "00" : hRaw, 10);
  const m = parseInt(get("minute"), 10);
  const s = parseInt(get("second"), 10);
  const ms = now.getMilliseconds();

  const elapsedMs = ((h * 60 + m) * 60 + s) * 1000 + ms;
  const todayMidnightUtc = new Date(now.getTime() - elapsedMs);
  return todayMidnightUtc.toISOString();
}

/**
 * Alias of `startOfTodayMadridIso`. Returns the ISO UTC timestamp for the
 * start of the Madrid calendar day containing `date`.
 */
export function madridMidnightISO(date: Date = new Date()): string {
  return startOfTodayMadridIso(date);
}

const madridDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Devuelve true si `iso` cae en el mismo día Madrid que `now`.
 */
export function isToday(iso: string, now: Date = new Date()): boolean {
  return madridDayFmt.format(new Date(iso)) === madridDayFmt.format(now);
}

/**
 * Returns true if two Date objects fall on the same calendar day in
 * Europe/Madrid timezone (handles CET/CEST automatically).
 */
export function isSameMadridDay(a: Date, b: Date): boolean {
  return madridDayFmt.format(a) === madridDayFmt.format(b);
}

/**
 * Milisegundos hasta la próxima medianoche Madrid. Maneja DST porque usa
 * `startOfTodayMadridIso` con una fecha 25h adelante desde la medianoche actual.
 */
export function msUntilNextMidnightMadrid(now: Date = new Date()): number {
  const todayMidnight = new Date(startOfTodayMadridIso(now));
  const ahead25h = new Date(todayMidnight.getTime() + 25 * 60 * 60 * 1000);
  const tomorrowMidnight = new Date(startOfTodayMadridIso(ahead25h));
  return tomorrowMidnight.getTime() - now.getTime();
}
