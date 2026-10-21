// -----------------------------------------------------------------------------
// The only place that talks to the network: one JSON POST with `fetch`,
// bounded in time and in size, no redirect followed (the password must never
// be sent again to another address). The tests replace fetch with setFetch().
//
// Errors never carry the URL (its query names the school), the headers (the
// session cookie) nor the body (the password).
// -----------------------------------------------------------------------------

import { HTTP_TIMEOUT, MAX_RESPONSE_BYTES, USER_AGENT } from './constants.js';

let fetchImpl = (...args) => globalThis.fetch(...args);

/** Replace the fetch implementation (tests only). Returns the previous one. */
export function setFetch(impl) {
  const previous = fetchImpl;
  fetchImpl = impl;
  return previous;
}

export class HttpError extends Error {
  /**
   * `kind`: 'http' (a status other than 2xx, in `status`), 'network' (no
   * answer, or cut), 'timeout', 'too_large', 'redirect'.
   */
  constructor(kind, message, { status, retryAfter } = {}) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
    this.status = status;
    /** Milliseconds the server asks to wait (Retry-After), when it gave a usable value. */
    this.retryAfter = retryAfter;
  }
}

/** Retry-After as milliseconds: seconds, or an HTTP date; undefined otherwise. */
export function retryAfterMs(header, now = Date.now()) {
  if (header === null || header === undefined || header === '') {
    return undefined;
  }
  const text = String(header).trim();
  if (/^\d{1,9}$/.test(text)) {
    return Number(text) * 1000;
  }
  const at = Date.parse(text);
  return Number.isFinite(at) && at > now ? at - now : undefined;
}

/** The body, read chunk by chunk and given up past `max` bytes (one concat at the end). */
async function readBounded(response, max) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    throw new HttpError('too_large', 'Answer too large');
  }
  if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text) > max) {
      throw new HttpError('too_large', 'Answer too large');
    }
    return text;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > max) {
      throw new HttpError('too_large', 'Answer too large');
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size).toString('utf8');
}

/**
 * POST `body` as JSON to `url`; resolves `{ status, text, headers }` for a 2xx
 * answer, throws an HttpError otherwise.
 */
export async function postJson(
  url,
  body,
  { headers = {}, timeout = HTTP_TIMEOUT, maxBytes = MAX_RESPONSE_BYTES } = {},
) {
  const controller = new AbortController();
  // A plain (ref'd) timer, cleared at the end: the exchange keeps the process
  // alive until it ends, and no stray timer outlives it.
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeout));
  try {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
          ...headers,
        },
        body: JSON.stringify(body),
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted
        ? new HttpError('timeout', 'No answer in time')
        : new HttpError('network', 'Unreachable');
    }
    if (response.status >= 300 && response.status < 400) {
      throw new HttpError('redirect', 'The server answered with a redirection', {
        status: response.status,
      });
    }
    if (response.type === 'opaqueredirect') {
      throw new HttpError('redirect', 'The server answered with a redirection');
    }
    let text;
    try {
      text = await readBounded(response, maxBytes);
    } catch (err) {
      if (err instanceof HttpError) {
        throw err;
      }
      throw controller.signal.aborted
        ? new HttpError('timeout', 'No answer in time')
        : new HttpError('network', 'Answer cut');
    }
    if (response.status < 200 || response.status >= 300) {
      throw new HttpError('http', `HTTP ${response.status}`, {
        status: response.status,
        retryAfter: retryAfterMs(response.headers?.get?.('retry-after')),
      });
    }
    return { status: response.status, text, headers: response.headers };
  } finally {
    clearTimeout(timer);
  }
}
