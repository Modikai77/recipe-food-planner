export type NormalizedUnit = "g" | "ml" | "count";

export type NormalizeResult = {
  normalizedQuantity?: number;
  normalizedUnit?: NormalizedUnit;
};

type UnitInfo =
  | { type: "volume"; toMl: number }
  | { type: "mass"; toG: number }
  | { type: "count" };

const UNIT_TABLE: Record<string, UnitInfo> = {
  tsp: { type: "volume", toMl: 4.92892 },
  teaspoon: { type: "volume", toMl: 4.92892 },
  teaspoons: { type: "volume", toMl: 4.92892 },
  tbsp: { type: "volume", toMl: 14.7868 },
  tablespoon: { type: "volume", toMl: 14.7868 },
  tablespoons: { type: "volume", toMl: 14.7868 },
  cup: { type: "volume", toMl: 236.588 },
  cups: { type: "volume", toMl: 236.588 },
  ml: { type: "volume", toMl: 1 },
  milliliter: { type: "volume", toMl: 1 },
  milliliters: { type: "volume", toMl: 1 },
  l: { type: "volume", toMl: 1000 },
  litre: { type: "volume", toMl: 1000 },
  litres: { type: "volume", toMl: 1000 },
  fl_oz: { type: "volume", toMl: 29.5735 },
  "fl oz": { type: "volume", toMl: 29.5735 },
  oz: { type: "mass", toG: 28.3495 },
  ounce: { type: "mass", toG: 28.3495 },
  ounces: { type: "mass", toG: 28.3495 },
  g: { type: "mass", toG: 1 },
  gram: { type: "mass", toG: 1 },
  grams: { type: "mass", toG: 1 },
  kg: { type: "mass", toG: 1000 },
  lb: { type: "mass", toG: 453.592 },
  pound: { type: "mass", toG: 453.592 },
  pounds: { type: "mass", toG: 453.592 },
  each: { type: "count" },
  count: { type: "count" },
};

function canonicalizeUnit(unit?: string | null): string | null {
  if (!unit) {
    return null;
  }

  return unit.trim().toLowerCase();
}

export function normalizeQuantity(quantity?: number | null, unit?: string | null): NormalizeResult {
  if (quantity === null || quantity === undefined || Number.isNaN(quantity)) {
    return {};
  }

  const canonicalUnit = canonicalizeUnit(unit);
  if (!canonicalUnit) {
    return { normalizedQuantity: quantity, normalizedUnit: "count" };
  }

  const info = UNIT_TABLE[canonicalUnit];
  if (!info) {
    return { normalizedQuantity: quantity, normalizedUnit: "count" };
  }

  if (info.type === "count") {
    return { normalizedQuantity: quantity, normalizedUnit: "count" };
  }

  if (info.type === "volume") {
    return { normalizedQuantity: quantity * info.toMl, normalizedUnit: "ml" };
  }

  return { normalizedQuantity: quantity * info.toG, normalizedUnit: "g" };
}

export type MeasurementPreference = "UK" | "US" | "METRIC";
export type ConversionPrefs = {
  keepSmallVolumeUnits?: boolean;
  forceMetricMass?: boolean;
};

export type DisplayQuantity = {
  quantity?: number;
  unit?: string;
};

function roundTo(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function roundWhole(value: number): number {
  return Math.round(value);
}

export function toDisplayUnit(
  quantity?: number | null,
  normalizedUnit?: string | null,
  preference: MeasurementPreference = "UK",
  conversionPrefs?: ConversionPrefs,
): DisplayQuantity {
  if (quantity === null || quantity === undefined || !normalizedUnit) {
    return {};
  }

  if (normalizedUnit === "count") {
    return { quantity: roundTo(quantity), unit: "count" };
  }

  if (conversionPrefs?.keepSmallVolumeUnits && normalizedUnit === "ml" && quantity <= 60) {
    if (quantity >= 15) {
      return { quantity: roundTo(quantity / 14.7868), unit: "tbsp" };
    }

    return { quantity: roundTo(quantity / 4.92892), unit: "tsp" };
  }

  if (conversionPrefs?.forceMetricMass && normalizedUnit === "g") {
    if (quantity >= 1000) {
      return { quantity: roundTo(quantity / 1000), unit: "kg" };
    }

    return { quantity: roundWhole(quantity), unit: "g" };
  }

  if (preference === "US" && normalizedUnit === "ml") {
    if (quantity >= 240) {
      return { quantity: roundTo(quantity / 236.588), unit: "cups" };
    }

    if (quantity >= 15) {
      return { quantity: roundTo(quantity / 14.7868), unit: "tbsp" };
    }

    return { quantity: roundTo(quantity / 4.92892), unit: "tsp" };
  }

  if (preference === "US" && normalizedUnit === "g") {
    if (quantity >= 453.592) {
      return { quantity: roundTo(quantity / 453.592), unit: "lb" };
    }

    return { quantity: roundTo(quantity / 28.3495), unit: "oz" };
  }

  if (normalizedUnit === "ml") {
    if (quantity >= 1000) {
      return { quantity: roundTo(quantity / 1000), unit: "l" };
    }

    return { quantity: roundWhole(quantity), unit: "ml" };
  }

  if (quantity >= 1000) {
    return { quantity: roundTo(quantity / 1000), unit: "kg" };
  }

  return { quantity: roundWhole(quantity), unit: "g" };
}
