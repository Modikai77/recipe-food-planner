import { describe, expect, it } from "vitest";
import { recommendRecipes } from "@/lib/services/recommendations";

describe("recommendRecipes", () => {
  const recipes = [
    {
      id: "1",
      title: "Veg Pasta",
      vegetarian: true,
      glutenFree: false,
      kidFriendlyScore: 0.8,
      prepMinutes: 25,
      cuisine: "Italian",
      tags: ["kids_favourite", "dinner", "vegetarian"],
    },
    {
      id: "2",
      title: "Chicken Rice",
      vegetarian: false,
      glutenFree: true,
      kidFriendlyScore: 0.75,
      prepMinutes: 40,
      cuisine: "Asian",
      tags: ["dinner"],
    },
    {
      id: "3",
      title: "Pancakes",
      vegetarian: true,
      glutenFree: false,
      kidFriendlyScore: 0.9,
      prepMinutes: 20,
      cuisine: "American",
      tags: ["breakfast", "kids_favourite"],
    },
  ];

  it("returns ranked recommendations", () => {
    const result = recommendRecipes(recipes, {
      count: 2,
      constraints: {
        maxPrepMinutes: 45,
      },
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.title)).toContain("Veg Pasta");
    expect(result.every((item) => item.reasons.length > 0)).toBe(true);
  });

  it("honors vegetarian hard filter", () => {
    const result = recommendRecipes(recipes, {
      count: 3,
      constraints: {
        vegetarian: true,
      },
    });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.title)).toContain("Veg Pasta");
  });
});
