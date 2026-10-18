import { describe, expect, it } from "vitest";
import { intentFor, isTypingTarget, pageForChord, PAGE_SHORTCUTS } from "./shortcuts";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });
const idle = { typing: false, dialogOpen: false };

describe("isTypingTarget", () => {
  it("is true for fields and editable text", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });
  it("is false for everything else", () => {
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("intentFor", () => {
  it("opens search with Ctrl+K or Cmd+K, even in a field or over a dialog", () => {
    expect(intentFor(key("k", { ctrlKey: true }), { typing: true, dialogOpen: true })).toBe("search");
    expect(intentFor(key("K", { metaKey: true }), idle)).toBe("search");
  });
  it("never fires plain keys while typing", () => {
    for (const k of ["/", "?", "g"]) expect(intentFor(key(k), { typing: true, dialogOpen: false })).toBeNull();
  });
  it("never fires plain keys over another dialog", () => {
    for (const k of ["/", "?", "g"]) expect(intentFor(key(k), { typing: false, dialogOpen: true })).toBeNull();
  });
  it("maps / ? and g when idle", () => {
    expect(intentFor(key("/"), idle)).toBe("search");
    expect(intentFor(key("?"), idle)).toBe("shortcuts");
    expect(intentFor(key("g"), idle)).toBe("chord-start");
    expect(intentFor(key("x"), idle)).toBeNull();
  });
  it("leaves browser shortcuts alone", () => {
    expect(intentFor(key("g", { ctrlKey: true }), idle)).toBeNull();
    expect(intentFor(key("/", { altKey: true }), idle)).toBeNull();
  });
});

describe("page chords", () => {
  it("has a unique letter for every page", () => {
    const keys = PAGE_SHORTCUTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("finds the page for a letter", () => {
    expect(pageForChord("o")).toBe("/overview");
    expect(pageForChord("A")).toBe("/applications");
    expect(pageForChord("z")).toBeNull();
  });
});
