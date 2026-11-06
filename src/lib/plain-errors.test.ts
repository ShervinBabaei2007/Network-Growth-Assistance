import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe("plain error messages", () => {
  it("never tells people only that something went wrong", () => {
    const hits = sources("src").filter((file) => /something went wrong/i.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });
});
