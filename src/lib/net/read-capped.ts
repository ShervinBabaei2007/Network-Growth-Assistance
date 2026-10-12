/**
 * Reads a fetch() response body with a size limit, so a third-party API that sends far
 * more than expected can't exhaust the server's memory. The limit is checked against the
 * Content-Length header first, then counted while streaming (headers can be missing or wrong).
 */

export class ResponseTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`The response was larger than ${Math.round(maxBytes / 1024)} KB.`);
  }
}

/** Typical limits. Job boards and feeds can be large; API answers about a person or a model reply are small. */
export const MB = 1024 * 1024;
export const BODY_LIMITS = { board: 25 * MB, feed: 25 * MB, api: 5 * MB, ai: 5 * MB } as const;

export async function readCappedText(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new ResponseTooLargeError(maxBytes);
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ResponseTooLargeError(maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Parses JSON read with a size limit. Throws ResponseTooLargeError or SyntaxError. */
export async function readCappedJson<T = unknown>(res: Response, maxBytes: number): Promise<T> {
  return JSON.parse(await readCappedText(res, maxBytes)) as T;
}
