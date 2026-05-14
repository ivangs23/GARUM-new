import { describe, it, expect } from "vitest";
import { formatEUR } from "../src/format/currency";

// Intl.NumberFormat usa un NBSP (U+00A0) entre la cantidad y el símbolo €.
// Lo declaramos explícitamente para que los tests resistan futuros editores
// que conviertan NBSPs en espacios normales.
const NBSP = " ";

describe("formatEUR", () => {
  it("formats integer euros with two decimals", () => {
    expect(formatEUR(10)).toBe(`10,00${NBSP}€`);
  });

  it("formats decimal amounts with comma separator", () => {
    expect(formatEUR(12.5)).toBe(`12,50${NBSP}€`);
  });

  it("formats large amounts with thousands separator", () => {
    expect(formatEUR(1234.56)).toBe(`1234,56${NBSP}€`);
  });

  it("formats zero", () => {
    expect(formatEUR(0)).toBe(`0,00${NBSP}€`);
  });

  it("handles negative amounts", () => {
    expect(formatEUR(-5)).toBe(`-5,00${NBSP}€`);
  });

  it("renders NaN as zero instead of 'NaN €'", () => {
    expect(formatEUR(NaN)).toBe(`0,00${NBSP}€`);
  });

  it("renders Infinity as zero", () => {
    expect(formatEUR(Infinity)).toBe(`0,00${NBSP}€`);
    expect(formatEUR(-Infinity)).toBe(`0,00${NBSP}€`);
  });
});
