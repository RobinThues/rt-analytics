import { describe, expect, it } from "vitest";
import { buildCatalog } from "@/discovery/catalog";
import { catalog } from "@/explorer/fixtures";
import { allowedFor, encodeStep, parseStep, toFunnelView, validateSteps } from "./steps";

describe("funnel steps", () => {
  it("parse and encode round trip, values may contain colons and pipes", () => {
    expect(parseStep("place_selected")).toEqual({ event: "place_selected", filter: null });
    expect(parseStep("$pageview:path:/a:b|c")).toEqual({
      event: "$pageview",
      filter: { key: "path", value: "/a:b|c" },
    });
    const s = { event: "subscribe_click", filter: { key: "target", value: "Google Kalender ü" } };
    expect(parseStep(encodeStep(s))).toEqual(s);
  });
  it("rejects bad names, empty keys or values", () => {
    expect(parseStep("bad name")).toBeNull();
    expect(parseStep("x:key:")).toBeNull();
    expect(parseStep("x::v")).toBeNull();
    expect(parseStep("x:key")).toBeNull();
    expect(parseStep(`x:key:${"v".repeat(201)}`)).toBeNull();
  });
  it("validateSteps: 2 to 5 known steps; $pageview only with path; saved funnels keep their keys", () => {
    const allowed = allowedFor(
      { ...catalog, events: [...catalog.events, { name: "subscribe_click", withVisitor: true, withSession: true }] },
      [
        {
          id: "1",
          name: "old",
          steps: [
            { event: "place_selected", filter: { key: "legacy", value: "1" } },
            { event: "subscribe_click", filter: null },
          ],
        },
      ],
    );
    expect(validateSteps([parseStep("place_selected:legacy:1"), parseStep("subscribe_click")], allowed)).toHaveLength(
      2,
    );
    expect(validateSteps([parseStep("place_selected")], allowed)).toBeNull();
    expect(validateSteps(Array(6).fill(parseStep("place_selected")), allowed)).toBeNull();
    expect(validateSteps([parseStep("$pageview:source:x"), parseStep("subscribe_click")], allowed)).toBeNull();
    expect(validateSteps([parseStep("$pageview:path:/"), parseStep("subscribe_click")], allowed)).toHaveLength(2);
    expect(validateSteps([parseStep("calendar_poll"), parseStep("subscribe_click")], allowed)).toBeNull(); // server event
    expect(validateSteps([null, parseStep("subscribe_click")], allowed)).toBeNull();
  });
  it("toFunnelView: conversion from first and previous, no NaN after a 0 step", () => {
    const rows = [
      { period: "cur", step: 1, sessions: 100 },
      { period: "cur", step: 2, sessions: 40 },
      { period: "prev", step: 1, sessions: 50 },
    ] as const;
    expect(toFunnelView([...rows], 3, true)).toEqual([
      { step: 1, cur: 100, prev: 50, fromFirst: 1, fromPrev: null, prevFromFirst: 1 },
      { step: 2, cur: 40, prev: 0, fromFirst: 0.4, fromPrev: 0.4, prevFromFirst: 0 },
      { step: 3, cur: 0, prev: 0, fromFirst: 0, fromPrev: 0, prevFromFirst: 0 },
    ]);
    expect(toFunnelView([], 2, false)[1]).toEqual({
      step: 2,
      cur: 0,
      prev: null,
      fromFirst: null,
      fromPrev: null,
      prevFromFirst: null,
    });
  });
});

describe("prototype-named events in funnels", () => {
  it("allowedFor and validateSteps work for __proto__ and constructor", () => {
    const c = buildCatalog(
      [
        { event_name: "__proto__", with_visitor: 1, with_session: 1 },
        { event_name: "constructor", with_visitor: 1, with_session: 1 },
      ],
      [{ event_name: "__proto__", prop_key: "k" }],
    );
    const allowed = allowedFor(c, []);
    expect(validateSteps([parseStep("__proto__:k:v"), parseStep("constructor")], allowed)).toHaveLength(2);
    expect(validateSteps([parseStep("constructor:k:v"), parseStep("__proto__")], allowed)).toBeNull();
  });
});
