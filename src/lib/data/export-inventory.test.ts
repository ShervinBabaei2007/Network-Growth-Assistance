import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXCLUDED_TABLES, EXPORTED_TABLES, PARTIAL_TABLES } from "./export-inventory";

/** Public tables with a user_id or added_by column, read from the generated types. */
function userOwnedTables(): string[] {
  const types = readFileSync("src/lib/supabase/database.types.ts", "utf8");
  const pub = types.slice(types.indexOf('"public": {'));
  const tables = pub.slice(pub.indexOf("Tables: {"), pub.indexOf("Views: {"));
  return [...tables.matchAll(/"(\w+)": \{\s*Row: \{([^}]*)\}/g)].filter((m) => /"(user_id|added_by)":/.test(m[2])).map((m) => m[1]);
}

describe("export inventory", () => {
  const decided = new Set<string>([...EXPORTED_TABLES, ...Object.keys(PARTIAL_TABLES), ...Object.keys(EXCLUDED_TABLES)]);

  it("decides on every user-owned table", () => {
    const owned = userOwnedTables();
    expect(owned.length).toBeGreaterThan(20);
    expect(owned.filter((t) => !decided.has(t))).toEqual([]);
  });

  it("names only tables that exist", () => {
    const types = readFileSync("src/lib/supabase/database.types.ts", "utf8");
    expect([...decided].filter((t) => !types.includes(`"${t}": {`))).toEqual([]);
  });

  it("lists each table once", () => {
    const all = [...EXPORTED_TABLES, ...Object.keys(PARTIAL_TABLES), ...Object.keys(EXCLUDED_TABLES)];
    expect(all.length).toBe(new Set(all).size);
  });
});
