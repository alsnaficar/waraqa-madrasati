/**
 * Waragh ↔ Madrasati pairing bridge (service worker).
 *
 * Runs in the extension's MV3 service worker and owns the ONLY cross-origin
 * network connection to Waragh for the claim flow. The content script never
 * issues a network request — it only talks to this worker through
 * `chrome.runtime.sendMessage` (see content.js).
 *
 * Storage contract (key `wqPairing`):
 *   {
 *     token,        // the raw one-time pairing token, held only here
 *     pairingId,    // server-assigned pairing row id once claimed
 *     state,        // 'pending' | 'paired' | 'failed'
 *     claimedAt     // ISO timestamp of a successful claim
 *   }
 *
 * The token is deliberately kept only in this service worker and never handed
 * back to the content script after a successful claim.
 */

const WQ_PAIRING_STORAGE_KEY = "wqPairing";

export const DEFAULT_WARAGH_BASE_URL = "https://waragh.alsnafi.app";
export const WARAGH_CLAIM_PATH = "/api/madrasati/pairing/claim";

/**
 * Builds the pairing bridge with injectable dependencies so it can be unit
 * tested without touching a real service worker (node:test).
 *
 * @param {object} deps
 * @param {typeof fetch} [deps.fetchImpl]  replaceable fetch (defaults to globalThis.fetch)
 * @param {object} [deps.storage]          chrome.storage.local-like { get, set } (defaults to chrome.storage.local)
 * @param {object} [deps.chrome]           chrome-like runtime.onMessage (defaults to globalThis.chrome)
 * @param {(msg: string) => void} [deps.log]
 * @param {string} [deps.baseUrl]          Waragh origin (defaults to DEFAULT_WARAGH_BASE_URL)
 */
export function createPairingBridge({
  fetchImpl = globalThis.fetch,
  storage,
  chromeRef,
  log = (message) => console.info(`[WaraghPairing] ${message}`),
  baseUrl = DEFAULT_WARAGH_BASE_URL,
} = {}) {
  const resolvedChrome = chromeRef ?? globalThis.chrome;
  const resolvedStorage = storage ?? resolvedChrome?.storage?.local;
  const origins = resolvedChrome?.runtime?.getManifest?.()?.host_permissions ?? [];

  /**
   * Registers the `chrome.runtime.onMessage` listener used by content.js.
   * Content scripts send `{ type: 'WARAGH_PAIRING_CLAIM', token }` with an
   * optional callback; the callback receives the safe claim result.
   *
   * Returns an unsubscribe function (mainly for tests / upgrades).
   */
  function registerMessageListener() {
    const listener = (message, _sender, sendResponse) => {
      if (!message || message.type !== "WARAGH_PAIRING_CLAIM") {
        return false;
      }

      const token = typeof message.token === "string" ? message.token : "";
      if (!token) {
        if (typeof sendResponse === "function") {
          sendResponse({ ok: false, code: "invalid_request" });
        }
        return undefined;
      }

      claim({ token })
        .then((result) => {
          if (typeof sendResponse === "function") {
            sendResponse(result);
          }
        })
        .catch(() => {
          if (typeof sendResponse === "function") {
            sendResponse({ ok: false, code: "error" });
          }
        });

      return true; // keep the message channel open for the async response
    };

    resolvedChrome.runtime.onMessage.addListener(listener);
    return () => resolvedChrome.runtime.onMessage.removeListener(listener);
  }

  /**
   * Claims a pairing token against Waragh's claim endpoint.
   *
   * @param {{ token: string }} payload
   * @returns {Promise<object>} the safe envelope forwarded to the caller
   */
  async function claim({ token }) {
    log(`claiming (hosts: ${(origins || []).join(", ") || "none"})`);

    if (typeof token !== "string" || token.length < 32 || token.length > 128) {
      return { ok: false, code: "invalid_request" };
    }

    let response;
    try {
      response = await fetchImpl(`${baseUrl}${WARAGH_CLAIM_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
    } catch (error) {
      log(`claim network error: ${error && error.message ? error.message : "fetch failed"}`);
      return { ok: false, code: "error" };
    }

    let body;
    try {
      body = await response.json();
    } catch {
      log(`claim returned non-JSON (status ${response.status})`);
      return { ok: false, code: "error" };
    }

    if (response.status !== 200) {
      log(`claim rejected (status ${response.status})`);
      return { ok: false, code: response.status === 429 ? "rate_limited" : "error" };
    }

    if (!body || body.ok !== true) {
      return {
        ok: false,
        code: body && body.code ? body.code : "error",
        message: body && body.message ? body.message : undefined,
      };
    }

    const persisted = {
      token,
      pairingId: body.pairingId,
      state: "paired",
      claimedAt: body.pairedAt || new Date().toISOString(),
    };
    await resolvedStorage.set({ [WQ_PAIRING_STORAGE_KEY]: persisted });

    // Never pass the token back to the content script.
    return {
      ok: true,
      pairingId: body.pairingId,
      state: "paired",
      pairedAt: persisted.claimedAt,
    };
  }

  /**
   * Reads the persisted pairing record (without exposing the raw token to
   * callers outside this worker).
   */
  async function getStoredPairing() {
    const data = await resolvedStorage.get({ [WQ_PAIRING_STORAGE_KEY]: null });
    return data && data[WQ_PAIRING_STORAGE_KEY] ? data[WQ_PAIRING_STORAGE_KEY] : null;
  }

  return { registerMessageListener, claim, getStoredPairing, storageKey: WQ_PAIRING_STORAGE_KEY };
}

// Only self-instantiate/register inside a real extension service worker; under
// node:test the module must import cleanly (tests call createPairingBridge
// with injected chrome/storage/fetch stubs).
const isChromeContext =
  typeof globalThis.chrome !== "undefined" &&
  globalThis.chrome.runtime &&
  typeof globalThis.chrome.runtime.id === "string";

if (isChromeContext) {
  createPairingBridge().registerMessageListener();
}
