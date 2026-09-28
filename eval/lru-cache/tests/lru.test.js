import { describe, expect, it } from "vitest";
import { LRUCache } from "../src/lru.js";

describe("LRUCache capacity", () => {
  it("evicts the least recently used entry when inserting at capacity", () => {
    const cache = new LRUCache(2);
    cache.put("a", 1);
    cache.put("b", 2);
    cache.put("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });

  it("rejects capacity below one", () => {
    expect(() => new LRUCache(0)).toThrow();
    expect(() => new LRUCache(-1)).toThrow();
  });
});

describe("LRUCache lookup and store", () => {
  it("returns the stored value", () => {
    const cache = new LRUCache(2);
    cache.put("k", "value");
    expect(cache.get("k")).toBe("value");
  });

  it("returns nothing for a missing key", () => {
    const cache = new LRUCache(2);
    expect(cache.get("nope")).toBeUndefined();
  });
});

describe("LRUCache recency", () => {
  it("a read entry survives the next eviction", () => {
    const cache = new LRUCache(2);
    cache.put("a", 1);
    cache.put("b", 2);
    cache.get("a"); // a is now most recently used
    cache.put("c", 3); // evicts b, not a
    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
  });
});
