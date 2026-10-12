import { describe, expect, it } from "vitest";
import { readCappedJson, readCappedText, ResponseTooLargeError } from "./read-capped";

/** A response streamed in chunks, with no Content-Length header. */
function streamed(chunks: string[]): Response {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(enc.encode(chunk));
        c.close();
      },
    }),
  );
}

describe("readCappedText", () => {
  it("reads a body within the limit", async () => {
    expect(await readCappedText(streamed(["hello ", "world"]), 100)).toBe("hello world");
  });

  it("stops a streamed body once it passes the limit", async () => {
    await expect(readCappedText(streamed(["x".repeat(60), "y".repeat(60)]), 100)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("refuses up front when Content-Length is over the limit", async () => {
    const res = new Response("small", { headers: { "content-length": "999999" } });
    await expect(readCappedText(res, 100)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("keeps multi-byte characters split across chunks intact", async () => {
    const bytes = new TextEncoder().encode("café");
    const res = new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(bytes.slice(0, 4));
          c.enqueue(bytes.slice(4));
          c.close();
        },
      }),
    );
    expect(await readCappedText(res, 100)).toBe("café");
  });

  it("reads an empty body", async () => {
    expect(await readCappedText(new Response(null), 100)).toBe("");
  });
});

describe("readCappedJson", () => {
  it("parses JSON", async () => {
    expect(await readCappedJson(streamed(['{"a":', "1}"]), 100)).toEqual({ a: 1 });
  });

  it("throws on invalid JSON", async () => {
    await expect(readCappedJson(streamed(["{nope"]), 100)).rejects.toBeInstanceOf(SyntaxError);
  });
});
