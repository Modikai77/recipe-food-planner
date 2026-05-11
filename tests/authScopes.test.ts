import { describe, expect, it } from "vitest";
import { hasScope, JARVIS_DEFAULT_SCOPES, type HouseholdPrincipal } from "@/lib/auth";

describe("Jarvis API token scopes", () => {
  it("default scopes allow recipe read/write without archive/delete", () => {
    expect(JARVIS_DEFAULT_SCOPES).toContain("recipes:read");
    expect(JARVIS_DEFAULT_SCOPES).toContain("recipes:write");
    expect(JARVIS_DEFAULT_SCOPES).not.toContain("recipes:archive");
    expect(JARVIS_DEFAULT_SCOPES).not.toContain("recipes:delete");
  });

  it("scope checks deny missing destructive permissions", () => {
    const principal: HouseholdPrincipal = {
      actorType: "apiToken",
      apiTokenId: "token_1",
      householdId: "household_1",
      tokenName: "Jarvis",
      scopes: [...JARVIS_DEFAULT_SCOPES],
      measurementPref: "UK",
      conversionPrefs: null,
    };

    expect(hasScope(principal, "recipes:read")).toBe(true);
    expect(hasScope(principal, "recipes:write")).toBe(true);
    expect(hasScope(principal, "recipes:archive")).toBe(false);
    expect(hasScope(principal, "recipes:delete")).toBe(false);
  });
});
