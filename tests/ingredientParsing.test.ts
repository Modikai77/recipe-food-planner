import { describe, expect, it } from "vitest";
import { parseIngredientLine } from "@/lib/services/ingredientParsing";

describe("parseIngredientLine", () => {
  it("extracts decimal quantity and unit", () => {
    const parsed = parseIngredientLine("2 tbsp olive oil");
    expect(parsed.quantity).toBe(2);
    expect(parsed.unit).toBe("tbsp");
    expect(parsed.itemName).toBe("olive oil");
  });

  it("extracts mixed fraction quantity", () => {
    const parsed = parseIngredientLine("1 1/2 cups flour");
    expect(parsed.quantity).toBeCloseTo(1.5, 5);
    expect(parsed.unit).toBe("cup");
    expect(parsed.itemName).toBe("flour");
  });

  it("handles quantity with no known unit", () => {
    const parsed = parseIngredientLine("3 eggs");
    expect(parsed.quantity).toBe(3);
    expect(parsed.unit).toBeUndefined();
    expect(parsed.itemName).toBe("eggs");
  });
});
