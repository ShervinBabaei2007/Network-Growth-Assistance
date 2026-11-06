import { describe, expect, it } from "vitest";
import { iconUrlFor, sniffIcon } from "./employer-icons";


const pad = (...head: number[]) => Uint8Array.from([...head, ...new Array(16).fill(0)]);

describe("sniffIcon", () => {
  it("recognises the image formats we serve", () => {
    expect(sniffIcon(pad(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffIcon(pad(0x00, 0x00, 0x01, 0x00))).toBe("image/x-icon");
    expect(sniffIcon(pad(0xff, 0xd8, 0xff))).toBe("image/jpeg");
    expect(sniffIcon(pad(0x47, 0x49, 0x46, 0x38))).toBe("image/gif");
  });
  it("refuses SVG, HTML and anything else that could carry script", () => {
    expect(sniffIcon(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffIcon(new TextEncoder().encode("<!doctype html><html></html>"))).toBeNull();
    expect(sniffIcon(new Uint8Array(4))).toBeNull();
  });
});

describe("iconUrlFor", () => {
  it("always uses the website's own origin", () => {
    expect(iconUrlFor("https://www.example.com/careers?x=1")).toBe("https://www.example.com/favicon.ico");
  });
});
