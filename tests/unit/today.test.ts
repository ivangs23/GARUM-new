import { describe, it, expect } from 'vitest';
import { startOfTodayMadridIso, isToday, msUntilNextMidnightMadrid } from '../../src/main/today';

describe('startOfTodayMadridIso', () => {
  it('devuelve 00:00 Madrid en formato ISO UTC para una fecha en CEST (verano)', () => {
    // 15 jun 2026 14:30 UTC → en Madrid son las 16:30 CEST (UTC+2)
    // Inicio del día Madrid 2026-06-15 → 2026-06-15 00:00 CEST = 2026-06-14 22:00 UTC
    const now = new Date('2026-06-15T14:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-06-14T22:00:00.000Z');
  });

  it('devuelve 00:00 Madrid en CET (invierno)', () => {
    // 15 ene 2026 14:30 UTC → en Madrid son las 15:30 CET (UTC+1)
    // Inicio del día Madrid 2026-01-15 → 2026-01-15 00:00 CET = 2026-01-14 23:00 UTC
    const now = new Date('2026-01-15T14:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-01-14T23:00:00.000Z');
  });

  it('a las 00:30 UTC en CEST devuelve el día actual de Madrid (mismo día UTC)', () => {
    // 15 jun 2026 00:30 UTC → en Madrid son las 02:30 CEST del 15 jun
    // Inicio de "hoy" Madrid = 14 jun 22:00 UTC
    const now = new Date('2026-06-15T00:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-06-14T22:00:00.000Z');
  });

  it('a las 23:30 UTC en CEST devuelve el día siguiente UTC (porque ya es el día siguiente en Madrid)', () => {
    // 15 jun 2026 23:30 UTC → en Madrid son las 01:30 CEST del 16 jun
    // Inicio de "hoy" Madrid = 15 jun 22:00 UTC
    const now = new Date('2026-06-15T23:30:00Z');
    expect(startOfTodayMadridIso(now)).toBe('2026-06-15T22:00:00.000Z');
  });
});

describe('isToday', () => {
  it('true cuando created_at y now caen en el mismo día Madrid', () => {
    const now = new Date('2026-06-15T14:30:00Z'); // 16:30 Madrid CEST
    expect(isToday('2026-06-15T08:00:00Z', now)).toBe(true); // 10:00 Madrid mismo día
  });

  it('false cuando created_at es de ayer Madrid', () => {
    const now = new Date('2026-06-15T10:00:00Z'); // 12:00 Madrid
    expect(isToday('2026-06-14T20:00:00Z', now)).toBe(false); // 22:00 ayer Madrid
  });

  it('considera el cruce de medianoche local correctamente', () => {
    const now = new Date('2026-06-15T22:30:00Z'); // 00:30 del 16 jun Madrid
    // Un pedido a las 23:30 UTC = 01:30 del 16 jun Madrid → mismo día Madrid
    expect(isToday('2026-06-15T23:30:00Z', now)).toBe(true);
    // Un pedido a las 21:30 UTC = 23:30 del 15 jun Madrid → día anterior Madrid
    expect(isToday('2026-06-15T21:30:00Z', now)).toBe(false);
  });
});

describe('msUntilNextMidnightMadrid', () => {
  it('a mediodía Madrid devuelve 12h en ms', () => {
    // 15 jun 2026 10:00 UTC = 12:00 Madrid CEST → faltan 12h
    const now = new Date('2026-06-15T10:00:00Z');
    expect(msUntilNextMidnightMadrid(now)).toBe(12 * 60 * 60 * 1000);
  });

  it('a las 23:30 Madrid devuelve 30 min en ms', () => {
    // 15 jun 2026 21:30 UTC = 23:30 Madrid CEST → faltan 30 min
    const now = new Date('2026-06-15T21:30:00Z');
    expect(msUntilNextMidnightMadrid(now)).toBe(30 * 60 * 1000);
  });

  it('siempre devuelve un valor en (0, 25h]', () => {
    const moments = [
      '2026-01-01T00:00:00Z',
      '2026-03-29T00:30:00Z', // día spring-forward CET→CEST
      '2026-10-25T01:30:00Z', // día fall-back CEST→CET
      '2026-12-31T23:59:00Z',
    ];
    for (const iso of moments) {
      const ms = msUntilNextMidnightMadrid(new Date(iso));
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
    }
  });
});
