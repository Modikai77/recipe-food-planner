export type ParsedIngredientLine = {
  itemName: string;
  quantity?: number;
  unit?: string;
};

const UNIT_MAP: Record<string, string> = {
  cup: "cup",
  cups: "cup",
  tbsp: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  lb: "lb",
  pound: "lb",
  pounds: "lb",
  each: "count",
};

function parseQuantity(value: string): number | undefined {
  const trimmed = value.trim();

  const mixedFraction = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixedFraction) {
    const whole = Number(mixedFraction[1]);
    const numerator = Number(mixedFraction[2]);
    const denominator = Number(mixedFraction[3]);
    if (denominator !== 0) {
      return whole + numerator / denominator;
    }
  }

  const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (denominator !== 0) {
      return numerator / denominator;
    }
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  return undefined;
}

export function parseIngredientLine(line: string): ParsedIngredientLine {
  const original = line.trim();
  let rest = original.replace(/^[-*•]\s*/, "");

  const quantityMatch = rest.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?:\s+|$)/);
  const quantity = quantityMatch ? parseQuantity(quantityMatch[1]) : undefined;

  if (quantityMatch) {
    rest = rest.slice(quantityMatch[0].length).trim();
  }

  let unit: string | undefined;
  const unitMatch = rest.match(
    /^(cups?|cup|tbsp|tablespoons?|tsp|teaspoons?|oz|ounces?|grams?|gram|g|kilograms?|kg|millilit(?:er|re)s?|ml|lit(?:er|re)s?|l|pounds?|lb|each)\b\.?/i,
  );

  if (unitMatch) {
    unit = UNIT_MAP[unitMatch[1].toLowerCase()];
    rest = rest.slice(unitMatch[0].length).trim();
  }

  const itemName = rest.replace(/^of\s+/i, "").trim() || original;

  return {
    itemName,
    quantity,
    unit,
  };
}
