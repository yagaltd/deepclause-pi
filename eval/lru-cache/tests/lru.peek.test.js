import { describe, expect, it } from "vitest";
import { LRUCache } from "../src/lru.js";

describe("LRUCache peek (visible suite)", () => {
  it("returns the stored value", () => {
    const cache = new LRUCache(2);
    cache.put("alpha", "beta");
    expect(cache.peek("alpha")).toBe("beta");
  });

  it("returns nothing for a missing key", () => {
    const cache = new LRUCache(2);
    expect(cache.peek("nope")).toBeUndefined();
  });
});
