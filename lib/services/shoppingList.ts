import type { MeasurementPreference } from "@/lib/services/unitConversion";
import { toDisplayUnit } from "@/lib/services/unitConversion";
import type { ConversionPrefs } from "@/lib/services/unitConversion";

export type ShoppingIngredient = {
  ingredientId?: string | null;
  itemName: string;
  normalizedQuantity?: number | null;
  normalizedUnit?: string | null;
};

export type ConsolidatedShoppingItem = {
  key: string;
  itemName: string;
  normalizedQuantity?: number;
  normalizedUnit?: string;
  displayQuantity?: number;
  displayUnit?: string;
};

export function consolidateShoppingItems(
  items: ShoppingIngredient[],
  preference: MeasurementPreference,
  conversionPrefs?: ConversionPrefs,
): ConsolidatedShoppingItem[] {
  const map = new Map<string, ConsolidatedShoppingItem>();

  for (const item of items) {
    const key = `${item.ingredientId ?? item.itemName.toLowerCase()}::${item.normalizedUnit ?? "count"}`;
    const current = map.get(key);
    const qty = item.normalizedQuantity ?? 0;

    if (!current) {
      map.set(key, {
        key,
        itemName: item.itemName,
        normalizedQuantity: qty,
        normalizedUnit: item.normalizedUnit ?? "count",
      });
      continue;
    }

    current.normalizedQuantity = (current.normalizedQuantity ?? 0) + qty;
  }

  return Array.from(map.values()).map((item) => {
    const display = toDisplayUnit(
      item.normalizedQuantity,
      item.normalizedUnit,
      preference,
      conversionPrefs,
    );

    return {
      ...item,
      displayQuantity: display.quantity,
      displayUnit: display.unit,
    };
  });
}
