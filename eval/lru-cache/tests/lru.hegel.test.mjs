import { test } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { LRUCache } from "../src/lru.js";

/** Reference model: independent LRU semantics for cross-checking. */
function modelStep(model, op) {
  const { cap, entries } = model; // entries: array of [key, value], index 0 = LRU
  if (op.t === "put") {
    const i = entries.findIndex(([k]) => k === op.k);
    if (i >= 0) entries.splice(i, 1);
    entries.push([op.k, op.v]);
    if (entries.length > cap) entries.shift();
  } else if (op.t === "get") {
    const i = entries.findIndex(([k]) => k === op.k);
    if (i >= 0) {
      const e = entries.splice(i, 1)[0];
      entries.push(e);
      op.result = e[1];
    } else {
      op.result = undefined;
    }
  }
  return model;
}

const arbOp = () => ({
  t: undefined, // filled below via draw composition
});

function drawOp(tc) {
  const t = tc.draw(gs.sampledFrom(["put", "get"]));
  const k = tc.draw(gs.text({ minLength: 0, maxLength: 5 }));
  const v = tc.draw(gs.integers({ minValue: -1000, maxValue: 1000 }));
  return { t, k, v };
}

test("hegel: size never exceeds capacity, for any operation sequence", () =>
  hegel.test((tc) => {
    const cap = tc.draw(gs.integers({ minValue: 1, maxValue: 8 }));
    const n = tc.draw(gs.integers({ minValue: 0, maxValue: 60 }));
    const cache = new LRUCache(cap);
    for (let i = 0; i < n; i++) {
      const op = drawOp(tc);
      if (op.t === "put") cache.put(op.k, op.v);
      else cache.get(op.k);
      if (cache.size > cap) throw new Error(`size ${cache.size} > cap ${cap}`);
    }
  }));

test("hegel: get returns the last put value for that key, when present", () =>
  hegel.test((tc) => {
    const cap = tc.draw(gs.integers({ minValue: 1, maxValue: 8 }));
    const n = tc.draw(gs.integers({ minValue: 0, maxValue: 60 }));
    const cache = new LRUCache(cap);
    const lastPut = new Map();
    for (let i = 0; i < n; i++) {
      const op = drawOp(tc);
      if (op.t === "put") {
        cache.put(op.k, op.v);
        lastPut.set(op.k, op.v);
      } else {
        const got = cache.get(op.k);
        if (got !== undefined && !lastPut.has(op.k)) throw new Error(`value for never-put key ${JSON.stringify(op.k)}`);
        if (got !== undefined && got !== lastPut.get(op.k)) throw new Error(`stale value for key ${JSON.stringify(op.k)}`);
      }
    }
  }));

test("hegel: matches an independent reference model exactly", () =>
  hegel.test((tc) => {
    const cap = tc.draw(gs.integers({ minValue: 1, maxValue: 6 }));
    const n = tc.draw(gs.integers({ minValue: 0, maxValue: 50 }));
    const cache = new LRUCache(cap);
    const model = { cap, entries: [] };
    for (let i = 0; i < n; i++) {
      const op = drawOp(tc);
      modelStep(model, op);
      if (op.t === "put") cache.put(op.k, op.v);
      else if (cache.get(op.k) !== op.result) throw new Error(`model mismatch on get ${JSON.stringify(op.k)}`);
    }
    if (cache.size !== model.entries.length) throw new Error(`size ${cache.size} != model ${model.entries.length}`);
  }));

test("hegel: a read entry survives the next eviction; the least recently used does not", () =>
  hegel.test((tc) => {
    const cap = tc.draw(gs.integers({ minValue: 2, maxValue: 6 }));
    const a = tc.draw(gs.text({ minLength: 1, maxLength: 4 }));
    const b = tc.draw(gs.text({ minLength: 1, maxLength: 4 }));
    if (a === b) return; // hegel: skip non-conflicting draws
    const v = tc.draw(gs.integers({ minValue: -50, maxValue: 50 }));
    const cache = new LRUCache(cap);
    const used = new Set([a, b]);
    const freshKey = () => {
      let k;
      do { k = `f${used.size}-${Math.random().toString(36).slice(2, 6)}`; } while (used.has(k));
      used.add(k);
      return k;
    };
    cache.put(a, v);
    cache.put(b, v);
    cache.get(a); // a is now most recently used; b is least
    while (cache.size < cap) cache.put(freshKey(), v); // reach capacity without evicting
    const next = freshKey();
    cache.put(next, v + 1); // insert at capacity evicts the LRU (b)
    if (cache.get(a) !== v) throw new Error("read entry was evicted");
    if (cache.get(b) !== undefined) throw new Error("LRU entry survived eviction");
  }));
