import { createElement as h, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { readOptions, selectChangeEvent, splitClasses } from "./select-options";

describe("readOptions", () => {
  it("reads values, labels and disabled from option elements", () => {
    const options = readOptions([h("option", { key: 1, value: "a" }, "Alpha"), h("option", { key: 2, value: "b", disabled: true }, "Beta")]);
    expect(options).toEqual([
      { value: "a", label: "Alpha", disabled: false },
      { value: "b", label: "Beta", disabled: true },
    ]);
  });

  it("keeps an empty value (a 'none' choice) and uses the text when there is no value attribute", () => {
    const options = readOptions([h("option", { key: 1, value: "" }, "Not set"), h("option", { key: 2 }, "Plain")]);
    expect(options.map((o) => o.value)).toEqual(["", "Plain"]);
  });

  it("flattens fragments and mapped arrays, and ignores everything else", () => {
    const mapped = ["x", "y"].map((v) => h("option", { key: v, value: v }, v.toUpperCase()));
    const options = readOptions(h(Fragment, null, h("option", { value: "first" }, "First"), mapped, "stray text", null, false, h("div", null, "not an option")));
    expect(options.map((o) => o.value)).toEqual(["first", "x", "y"]);
  });

  it("stringifies numeric values", () => {
    expect(readOptions(h("option", { value: 7 }, "Seven"))[0].value).toBe("7");
  });
});

describe("selectChangeEvent", () => {
  it("looks like the event a native select handler reads", () => {
    const e = selectChangeEvent("screening", "stage");
    expect(e.target.value).toBe("screening");
    expect(e.currentTarget.value).toBe("screening");
    expect(e.target.name).toBe("stage");
  });
});

describe("splitClasses", () => {
  it("keeps width and margin with the wrapper and height and text size with the control", () => {
    expect(splitClasses("h-7 text-xs w-40 mt-1")).toEqual(["w-40 mt-1", "h-7 text-xs"]);
  });

  it("understands responsive and state prefixes", () => {
    expect(splitClasses("sm:w-48 md:h-9 max-w-xs")).toEqual(["sm:w-48 max-w-xs", "md:h-9"]);
  });

  it("copes with nothing", () => {
    expect(splitClasses(undefined)).toEqual(["", ""]);
    expect(splitClasses("  ")).toEqual(["", ""]);
  });
});
