// MYRAA WhatsApp bridge — self-chat control via whatsapp-web.js
// User scans QR on first run, then any message sent to *self* on WhatsApp
// gets routed to MYRAA's AI, executed on the PC, and replied to.

const path = require("path");
const QRCode = require("qrcode");

let Client, LocalAuth;
try {
  ({ Client, LocalAuth } = require("whatsapp-web.js"));
} catch (e) {
  console.log("[myraa-wa] whatsapp-web.js not installed:", e.message);
}

let client = null;
let state = {
  status: "idle",     // idle | starting | qr | authenticated | ready | disconnected | error
  qrDataUrl: null,    // data:image/png;base64,...
  qrRaw: null,
  ownNumber: null,    // e.g. "8801XXXXXXXXX@c.us"
  ownDisplay: null,   // e.g. "+8801XXXXXXXXX"
  error: null,
  lastMessage: null,
  startedAt: null,
};

const listeners = new Set();
function emit() {
  const snap = getState();
  for (const fn of listeners) { try { fn(snap); } catch {} }
}
function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

function getState() {
  return {
    status: state.status,
    qrDataUrl: state.qrDataUrl,
    ownNumber: state.ownNumber,
    ownDisplay: state.ownDisplay,
    error: state.error,
    lastMessage: state.lastMessage,
    startedAt: state.startedAt,
    available: !!Client,
  };
}

async function start({ userDataDir, onCommand }) {
  if (!Client) {
    state.status = "error";
    state.error = "whatsapp-web.js not installed";
    emit();
    return getState();
  }
  if (client) return getState();

  state.status = "starting";
  state.error = null;
  state.startedAt = Date.now();
  emit();

  try {
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: "myraa",
        dataPath: path.join(userDataDir, "wa-session"),
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      },
    });
  } catch (e) {
    state.status = "error";
    state.error = e.message;
    emit();
    return getState();
  }

  client.on("qr", async (qr) => {
    try {
      state.qrRaw = qr;
      state.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
      state.status = "qr";
      emit();
    } catch (e) { console.log("[myraa-wa] qr err", e.message); }
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
    state.qrDataUrl = null;
    state.qrRaw = null;
    emit();
  });

  client.on("auth_failure", (m) => {
    state.status = "error";
    state.error = "auth failed: " + m;
    emit();
  });

  client.on("ready", () => {
    try {
      const wid = client.info?.wid;
      state.ownNumber = wid?._serialized || null;
      state.ownDisplay = wid?.user ? "+" + wid.user : null;
    } catch {}
    state.status = "ready";
    state.qrDataUrl = null;
    emit();
    console.log("[myraa-wa] ready. own:", state.ownDisplay);
  });

  client.on("disconnected", (reason) => {
    state.status = "disconnected";
    state.error = String(reason || "");
    emit();
  });

  // Handle self-chat messages (also fires for messages we send ourselves,
  // which is exactly what we want for the self-note control pattern).
  client.on("message_create", async (msg) => {
    try {
      if (!state.ownNumber) return;
      // Only accept messages in the "chat with self" thread
      const selfChat = msg.fromMe && msg.to === state.ownNumber;
      if (!selfChat) return;

      const text = (msg.body || "").trim();
      if (!text) return;

      // Ignore MYRAA's own reply echoes
      if (text.startsWith("🤖")) return;

      state.lastMessage = { text, at: Date.now(), dir: "in" };
      emit();

      let reply = "OK Sir.";
      try {
        const result = await onCommand({ prompt: text });
        if (result?.error) reply = "⚠️ " + result.error;
        else reply = result?.reply || "OK Sir.";
      } catch (e) {
        reply = "⚠️ " + (e.message || String(e));
      }

      try {
        await client.sendMessage(state.ownNumber, "🤖 " + reply);
        state.lastMessage = { text: reply, at: Date.now(), dir: "out" };
        emit();
      } catch (e) {
        console.log("[myraa-wa] reply err", e.message);
      }
    } catch (e) {
      console.log("[myraa-wa] msg handler err", e.message);
    }
  });

  try {
    await client.initialize();
  } catch (e) {
    state.status = "error";
    state.error = e.message;
    emit();
  }
  return getState();
}

async function stop() {
  if (!client) return { ok: true };
  try { await client.destroy(); } catch {}
  client = null;
  state.status = "idle";
  state.qrDataUrl = null;
  state.ownNumber = null;
  state.ownDisplay = null;
  emit();
  return { ok: true };
}

async function logout() {
  if (!client) return { ok: true };
  try { await client.logout(); } catch {}
  try { await client.destroy(); } catch {}
  client = null;
  state.status = "idle";
  state.qrDataUrl = null;
  state.ownNumber = null;
  state.ownDisplay = null;
  emit();
  return { ok: true };
}

async function sendToSelf(text) {
  if (!client || !state.ownNumber) return { ok: false, out: "not ready" };
  try { await client.sendMessage(state.ownNumber, String(text)); return { ok: true }; }
  catch (e) { return { ok: false, out: e.message }; }
}

module.exports = { start, stop, logout, getState, onChange, sendToSelf };
