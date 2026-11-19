// Reading the request body without ever holding more than the cap (security
// review, round 5, 2026-11-19). The function used to call `req.text()` and
// check the length afterwards, so a caller with a valid session could make it
// hold a body of any size before refusing it.
//
// A copy of readBodyCapped in ../coach/contract.ts, kept here so this
// function doesn't bundle the Coach's contract (each deploy bundles what its
// index imports). One difference, on purpose: a request with no body at all
// reads as an empty one, which parseRequest takes as a deletion with no Apple
// code (the app sends `{}`, and an empty body has always been accepted). Fix
// a bug in one, fix it in the other.
//
// No Deno globals and no npm: imports, so Jest can test it (readBody.test.ts).

/** The part of a ReadableStream the reader uses. */
export interface BodyStreamLike {
  getReader(): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    cancel(reason?: unknown): Promise<void>;
  };
}

export type BodyRead = { ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' };

/**
 * Read a request body as UTF-8 text, never holding more than `maxBytes`.
 *
 * A declared Content-Length over the cap is refused before a byte is read; a
 * header that isn't a plain number is refused too. The stream is still
 * counted as it arrives, since a body can be sent without the header
 * (chunked) or longer than it says. Bytes that aren't UTF-8 are unreadable.
 * No body at all is an empty one.
 */
export async function readBodyCapped(
  contentLength: string | null,
  body: BodyStreamLike | null,
  maxBytes: number,
): Promise<BodyRead> {
  if (contentLength !== null) {
    if (!/^\d{1,15}$/.test(contentLength.trim())) return { ok: false, reason: 'unreadable' };
    if (Number(contentLength.trim()) > maxBytes) return { ok: false, reason: 'too_large' };
  }
  if (!body) return { ok: true, text: '' };

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
}
