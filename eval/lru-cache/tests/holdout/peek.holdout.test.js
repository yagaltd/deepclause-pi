import { describe, expect, it } from "vitest";
import { LRUCache } from "../../src/lru.js";

// Evaluator hold-out suite: written BEFORE implementation, never shown to the
// implementer. Covers behavior the visible suite does not.
describe("hold-out: peek", () => {
  it("peek does NOT refresh recency (peeked eldest still evicted first)", () => {
    const c = new LRUCache(2);
    c.put("a", 1);
    c.put("b", 2);
    expect(c.peek("a")).toBe(1); // peek the eldest
    c.put("c", 3);               // at capacity: must evict a (still eldest)
    expect(c.get("a")).toBeUndefined();
    expect(c.get("b")).toBe(2);
  });

  it("peek on arbitrary keys matches get's value but not its recency effect", () => {
    const c = new LRUCache(3);
    c.put("x", 10);
    c.put("y", 20);
    c.put("z", 30);
    expect(c.peek("x")).toBe(10);
    c.put("w", 40); // evicts x (peek must not have refreshed it)
    expect(c.peek("x")).toBeUndefined();
    expect(c.peek("y")).toBe(20);
  });

  it("peek of a missing key returns undefined without throwing", () => {
    const c = new LRUCache(2);
    expect(() => c.peek("ghost")).not.toThrow();
    expect(c.peek("ghost")).toBeUndefined();
  });

  it("peek works for falsy stored values", () => {
    const c = new LRUCache(2);
    c.put("zero", 0);
    c.put("empty", "");
    expect(c.peek("zero")).toBe(0);
    expect(c.peek("empty")).toBe("");
  });
});
