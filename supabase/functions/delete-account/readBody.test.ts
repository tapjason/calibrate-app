// The delete-account body reader (security review, round 5, 2026-11-19): the
// function used to read the whole body with req.text() and only then check
// its size. A copy of the Coach's readBodyCapped, with one difference: no body
// at all is an empty one, as the function has always accepted.

import { MAX_BODY_BYTES, parseRequest } from './deletionPlan';
import { readBodyCapped, type BodyStreamLike } from './readBody';

function streamOf(chunks: Uint8Array[]): BodyStreamLike & { reads: number; cancelled: boolean } {
  const state = { reads: 0, cancelled: false };
  return {
    get reads() {
      return state.reads;
    },
    get cancelled() {
      return state.cancelled;
    },
    getReader() {
      let i = 0;
      return {
        async read() {
          state.reads += 1;
          if (i >= chunks.length) return { done: true };
          return { done: false, value: chunks[i++] };
        },
        async cancel() {
          state.cancelled = true;
        },
      };
    },
  };
}

const bytes = (text: string) => new TextEncoder().encode(text);

describe('delete-account: readBodyCapped', () => {
  it("reads the app's body, with or without an Apple code", async () => {
    for (const body of ['{}', JSON.stringify({ apple_authorization_code: 'c'.repeat(1_000) })]) {
      const read = await readBodyCapped(String(bytes(body).length), streamOf([bytes(body)]), MAX_BODY_BYTES);
      expect(read).toEqual({ ok: true, text: body });
    }
  });

  it('reads a body sent in pieces and without a length', async () => {
    await expect(
      readBodyCapped(null, streamOf([bytes('{"apple_authorization_code":'), bytes('"abc"}')]), MAX_BODY_BYTES),
    ).resolves.toEqual({ ok: true, text: '{"apple_authorization_code":"abc"}' });
  });

  // An empty body has always been a valid request (parseRequest), so the
  // reader keeps it one.
  it('reads no body at all as an empty one, which is a request with no Apple code', async () => {
    const read = await readBodyCapped(null, null, MAX_BODY_BYTES);
    expect(read).toEqual({ ok: true, text: '' });
    expect(parseRequest(null)).toEqual({ appleAuthorizationCode: null });
    await expect(readBodyCapped('0', null, MAX_BODY_BYTES)).resolves.toEqual({ ok: true, text: '' });
  });

  it('refuses a declared length over the cap without reading a byte', async () => {
    const stream = streamOf([bytes('{}')]);
    await expect(readBodyCapped(String(MAX_BODY_BYTES + 1), stream, MAX_BODY_BYTES)).resolves.toEqual({
      ok: false,
      reason: 'too_large',
    });
    expect(stream.reads).toBe(0);
  });

  it('takes a declared length at the cap', async () => {
    const body = `{"apple_authorization_code":"${'c'.repeat(MAX_BODY_BYTES - 31)}"}`;
    expect(bytes(body).length).toBe(MAX_BODY_BYTES);
    await expect(readBodyCapped(String(MAX_BODY_BYTES), streamOf([bytes(body)]), MAX_BODY_BYTES)).resolves.toEqual({
      ok: true,
      text: body,
    });
  });

  it('stops reading, and cancels, once more arrives than the cap', async () => {
    const chunk = new Uint8Array(1_500);
    const stream = streamOf([chunk, chunk, chunk, chunk, chunk]);
    await expect(readBodyCapped(null, stream, MAX_BODY_BYTES)).resolves.toEqual({ ok: false, reason: 'too_large' });
    // 1,500, 3,000, then 4,500 > 4,000: the third read ends it.
    expect(stream.reads).toBe(3);
    expect(stream.cancelled).toBe(true);
  });

  it('counts what arrives even when the declared length is small', async () => {
    const stream = streamOf([new Uint8Array(MAX_BODY_BYTES + 1)]);
    await expect(readBodyCapped('10', stream, MAX_BODY_BYTES)).resolves.toEqual({ ok: false, reason: 'too_large' });
  });

  it('counts bytes, not characters', async () => {
    const text = '€'.repeat(1_500); // 3 bytes each: 4,500 bytes, 1,500 characters
    await expect(readBodyCapped(null, streamOf([bytes(text)]), MAX_BODY_BYTES)).resolves.toEqual({
      ok: false,
      reason: 'too_large',
    });
  });

  it.each(['-1', 'abc', '1e3', '12 34', ''])('refuses a Content-Length of %p', async (length) => {
    await expect(readBodyCapped(length, streamOf([bytes('{}')]), MAX_BODY_BYTES)).resolves.toEqual({
      ok: false,
      reason: 'unreadable',
    });
  });

  it('refuses bytes that are not UTF-8', async () => {
    await expect(
      readBodyCapped(null, streamOf([new Uint8Array([0xff, 0xfe, 0xfd])]), MAX_BODY_BYTES),
    ).resolves.toEqual({ ok: false, reason: 'unreadable' });
  });

  it('refuses a stream that fails mid-read', async () => {
    const broken: BodyStreamLike = {
      getReader: () => ({
        read: async () => {
          throw new Error('reset');
        },
        cancel: async () => undefined,
      }),
    };
    await expect(readBodyCapped(null, broken, MAX_BODY_BYTES)).resolves.toEqual({ ok: false, reason: 'unreadable' });
  });
});
