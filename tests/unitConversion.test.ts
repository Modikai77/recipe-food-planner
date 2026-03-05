import { describe, expect, it } from "vitest";
import { normalizeQuantity, toDisplayUnit } from "@/lib/services/unitConversion";

describe("normalizeQuantity", () => {
  it("converts US cups to ml", () => {
    const result = normalizeQuantity(2, "cup");
    expect(result.normalizedUnit).toBe("ml");
    expect(result.normalizedQuantity).toBeCloseTo(473.176, 3);
  });

  it("converts oz to grams", () => {
    const result = normalizeQuantity(1, "oz");
    expect(result.normalizedUnit).toBe("g");
    expect(result.normalizedQuantity).toBeCloseTo(28.3495, 4);
  });

  it("treats unknown unit as count", () => {
    const result = normalizeQuantity(3, "pinchish");
    expect(result.normalizedUnit).toBe("count");
    expect(result.normalizedQuantity).toBe(3);
  });
});

describe("toDisplayUnit", () => {
  it("formats metric for UK preference", () => {
    const result = toDisplayUnit(1200, "ml", "UK");
    expect(result.unit).toBe("l");
    expect(result.quantity).toBe(1.2);
  });

  it("formats ml to tbsp for US preference", () => {
    const result = toDisplayUnit(30, "ml", "US");
    expect(result.unit).toBe("tbsp");
    expect(result.quantity).toBeCloseTo(2.03, 2);
  });
});
