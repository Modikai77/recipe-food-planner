import { describe, expect, it } from "vitest";
import { consolidateShoppingItems } from "@/lib/services/shoppingList";

describe("consolidateShoppingItems", () => {
  it("merges matching ingredients by normalized unit", () => {
    const result = consolidateShoppingItems(
      [
        { ingredientId: "tomato", itemName: "Tomato", normalizedQuantity: 200, normalizedUnit: "g" },
        { ingredientId: "tomato", itemName: "Tomato", normalizedQuantity: 300, normalizedUnit: "g" },
      ],
      "UK",
    );

    expect(result).toHaveLength(1);
    expect(result[0].normalizedQuantity).toBe(500);
    expect(result[0].displayUnit).toBe("g");
  });
});
