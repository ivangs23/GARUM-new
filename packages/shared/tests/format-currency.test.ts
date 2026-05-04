import { describe, it, expect } from "vitest";
import { formatEUR } from "../src/format/currency";

describe("formatEUR", () => {
  it("formats integer euros with two decimals", () => {
    expect(formatEUR(10)).toBe("10,00 €");
  });

  it("formats decimal amounts with comma separator", () => {
    expect(formatEUR(12.5)).toBe("12,50 €");
  });

  it("formats large amounts with thousands separator", () => {
    expect(formatEUR(1234.56)).toBe("1234,56 €");
  });

  it("formats zero", () => {
    expect(formatEUR(0)).toBe("0,00 €");
  });

  it("handles negative amounts", () => {
    expect(formatEUR(-5)).toBe("-5,00 €");
  });
});
