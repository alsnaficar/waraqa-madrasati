import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createPairingBridge,
  DEFAULT_WARAGH_BASE_URL,
  WARAGH_CLAIM_PATH,
} from "./background.js";

function validToken() {
  return "a".repeat(43);
}

function storageStub(initial = {}) {
  const store = { ...initial };
  return {
    storage: {
      async get(query) {
        const keys = Array.isArray(query) ? query : Object.keys(query || {});
        const result = {};
        for (const key of keys) {
          result[key] = key in store ? store[key] : null;
        }
        return result;
      },
      async set(items) {
        Object.assign(store, items);
      },
    },
    snapshot() {
      return { ...store };
    },
  };
}

function chromeStub() {
  const listeners = [];
  return {
    chrome: {
      runtime: {
        id: "test-extension-id",
        getManifest() {
          return { host_permissions: ["https://waragh.alsnafi.app/*"] };
        },
        onMessage: {
          addListener(fn) {
            listeners.push(fn);
          },
          removeListener(fn) {
            const i = listeners.indexOf(fn);
            if (i >= 0) {
              listeners.splice(i, 1);
            }
          },
        },
      },
      storage: { local: undefined },
    },
    listeners,
  };
}

test("createPairingBridge builds with defaults and injectables", () => {
  const { storage } = storageStub();
  const { chrome } = chromeStub();
  chrome.runtime.getManifest = () => ({ host_permissions: [] });
  const bridge = createPairingBridge({
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    storage,
    log: () => {},
  });
  assert.equal(bridge.storageKey, "wqPairing");
  assert.equal(typeof bridge.claim, "function");
  assert.equal(typeof bridge.registerMessageListener, "function");
});

test("claim posts to the Waragh endpoint with a JSON body and content-type", async () => {
  const { storage } = storageStub();
  let captured = null;
  const fetchImpl = async (url, opts) => {
    captured = { url, opts };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  const bridge = createPairingBridge({ fetchImpl, storage, log: () => {} });
  const token = validToken();
  await bridge.claim({ token });

  assert.equal(captured.url, `${DEFAULT_WARAGH_BASE_URL}${WARAGH_CLAIM_PATH}`);
  assert.equal(captured.opts.method, "POST");
  assert.equal(captured.opts.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(captured.opts.body), { token });
});

test("claim returns the safe envelope and persists storage on success", async () => {
  const { storage, snapshot } = storageStub();
  const bridge = createPairingBridge({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ ok: true, pairingId: "p-1", state: "paired", pairedAt: "2026-09-05T00:00:00.000Z" }),
        { status: 200 },
      ),
    storage,
    log: () => {},
  });

  const token = validToken();
  const result = await bridge.claim({ token });

  assert.deepEqual(result, { ok: true, pairingId: "p-1", state: "paired", pairedAt: "2026-09-05T00:00:00.000Z" });
  assert.ok(!JSON.stringify(result).includes(token), "token must not be returned to the caller");

  const stored = snapshot();
  assert.equal(stored.wqPairing.token, token);
  assert.equal(stored.wqPairing.state, "paired");
});

test("claim returns ok:false with server code for non-ok server bodies", async () => {
  const { storage } = storageStub();
  const bridge = createPairingBridge({
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, code: "expired", message: "expired" }), { status: 200 }),
    storage,
    log: () => {},
  });

  const result = await bridge.claim({ token: validToken() });
  assert.deepEqual(result, { ok: false, code: "expired", message: "expired" });
});

test("claim maps 429 to rate_limited", async () => {
  const { storage } = storageStub();
  const bridge = createPairingBridge({
    fetchImpl: async () => new Response(JSON.stringify({ ok: false }), { status: 429 }),
    storage,
    log: () => {},
  });

  const result = await bridge.claim({ token: validToken() });
  assert.deepEqual(result, { ok: false, code: "rate_limited" });
});

test("claim rejects an invalid token length without fetching", async () => {
  const { storage } = storageStub();
  let fetched = false;
  const bridge = createPairingBridge({
    fetchImpl: async () => {
      fetched = true;
      return new Response("{}", { status: 200 });
    },
    storage,
    log: () => {},
  });

  const short = await bridge.claim({ token: "short" });
  const long = await bridge.claim({ token: "a".repeat(200) });
  assert.equal(short.code, "invalid_request");
  assert.equal(long.code, "invalid_request");
  assert.equal(fetched, false, "no network request for invalid tokens");
});

test("claim turns a network failure into generic error", async () => {
  const { storage } = storageStub();
  const bridge = createPairingBridge({
    fetchImpl: async () => {
      throw new Error("network down");
    },
    storage,
    log: () => {},
  });

  const result = await bridge.claim({ token: validToken() });
  assert.deepEqual(result, { ok: false, code: "error" });
});

test("claim turns a non-JSON response into generic error", async () => {
  const { storage } = storageStub();
  const bridge = createPairingBridge({
    fetchImpl: async () => new Response("<html>error</html>", { status: 502 }),
    storage,
    log: () => {},
  });

  const result = await bridge.claim({ token: validToken() });
  assert.deepEqual(result, { ok: false, code: "error" });
});

test("registerMessageListener responds to WARAGH_PAIRING_CLAIM and stays async", async () => {
  const { storage, snapshot } = storageStub();
  const { chrome, listeners } = chromeStub();
  const bridge = createPairingBridge({
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, pairingId: "p-9", state: "paired", pairedAt: "t" }), { status: 200 }),
    storage,
    chromeRef: chrome,
    log: () => {},
  });

  const unregister = bridge.registerMessageListener();
  assert.equal(listeners.length, 1);
  const listener = listeners[0];

  // Non-matching messages are not handled.
  assert.equal(listener({ type: "OTHER" }, {}, () => {}), false);

  // Matching message keeps the channel open (returns true) and resolves async.
  const token = validToken();
  let response = null;
  const keepAlive = listener({ type: "WARAGH_PAIRING_CLAIM", token }, {}, (r) => (response = r));
  assert.equal(keepAlive, true, "async response keeps the message channel open");

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(response, "response was delivered");
  assert.equal(response.ok, true);
  assert.equal(response.pairingId, "p-9");
  assert.ok(!JSON.stringify(response).includes(token), "token not returned");
  assert.equal(snapshot().wqPairing.token, token, "token kept in worker storage");

  unregister();
  assert.equal(listeners.length, 0);
});

test("storage stub honors get defaults", async () => {
  const { storage, snapshot } = storageStub({ wqPairing: { token: "tok" } });
  const bridge = createPairingBridge({
    fetchImpl: async () => new Response("{}", { status: 200 }),
    storage,
    log: () => {},
  });
  const pairing = await bridge.getStoredPairing();
  assert.equal(pairing.token, "tok");
  assert.deepEqual(snapshot(), { wqPairing: { token: "tok" } });
});