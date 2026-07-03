// MYRAA WhatsApp bridge — self-chat control via whatsapp-web.js
// User scans QR on first run, then any message sent to *self* on WhatsApp
// gets routed to MYRAA's AI, executed on the PC, and replied to.

const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

let Client, LocalAuth;
let MessageMedia;
try {
  ({ Client, LocalAuth, MessageMedia } = require("whatsapp-web.js"));
} catch (e) {
  console.log("[myraa-wa] whatsapp-web.js not installed:", e.message);
}

const STT_URL = "https://tdijnzdeofeylvqscjdv.supabase.co/functions/v1/myraa-stt";

// Find a locally-installed Chromium-based browser on Windows so puppeteer
// doesn't need to download its own Chrome (which fails on packaged app).
function findLocalChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Microsoft/Edge/Application/msedge.exe"),
    "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  ].filter(Boolean);
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

async function transcribeVoice(base64, mimeType) {
  try {
    const res = await fetch(STT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio: base64, mimeType: mimeType || "audio/ogg" }),
    });
    if (!res.ok) return { error: `STT ${res.status}` };
    const data = await res.json();
    if (data.error) return { error: data.error };
    return { text: String(data.text || "").trim() };
  } catch (e) { return { error: e.message || String(e) }; }
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
    const chromePath = findLocalChrome();
    if (!chromePath) {
      state.status = "error";
      state.error = "Chrome/Edge browser paoya jayni. Google Chrome ba Microsoft Edge install koro.";
      emit();
      return getState();
    }
    console.log("[myraa-wa] using browser:", chromePath);
    client = new Client({
      authStrategy: new LocalAuth({
        clientId: "myraa",
        dataPath: path.join(userDataDir, "wa-session"),
      }),
      puppeteer: {
        headless: true,
        executablePath: chromePath,
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
      // Accept messages in the "chat with self" thread — some WA versions
      // report the self chat as msg.to, others as msg.from. Check both.
      const isSelfThread =
        (msg.to && msg.to === state.ownNumber) ||
        (msg.from && msg.from === state.ownNumber);
      const selfChat = msg.fromMe && isSelfThread;
      if (!selfChat) {
        // Uncomment for debugging: console.log("[myraa-wa] ignored msg", { fromMe: msg.fromMe, to: msg.to, from: msg.from, own: state.ownNumber });
        return;
      }
      console.log("[myraa-wa] self-chat received:", { type: msg.type, body: (msg.body || "").slice(0, 60) });

      let text = (msg.body || "").trim();
      let viaVoice = false;

      // Voice note → transcribe first
      const isVoice = msg.hasMedia && (msg.type === "ptt" || msg.type === "audio");
      if (isVoice) {
        try {
          const media = await msg.downloadMedia();
          if (media?.data) {
            state.lastMessage = { text: "🎤 transcribing voice...", at: Date.now(), dir: "in" };
            emit();
            const stt = await transcribeVoice(media.data, media.mimetype);
            if (stt.error) {
              await client.sendMessage(state.ownNumber, "🤖 ⚠️ voice bujhte parlam na: " + stt.error);
              return;
            }
            text = (stt.text || "").trim();
            viaVoice = true;
          }
        } catch (e) {
          await client.sendMessage(state.ownNumber, "🤖 ⚠️ voice download fail: " + e.message);
          return;
        }
      }

      if (!text) return;

      // Ignore MYRAA's own reply echoes
      if (text.startsWith("🤖")) return;

      state.lastMessage = { text: (viaVoice ? "🎤 " : "") + text, at: Date.now(), dir: "in" };
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
        const prefix = viaVoice ? `🤖 (🎤 "${text.slice(0, 60)}")\n` : "🤖 ";
        await client.sendMessage(state.ownNumber, prefix + reply);
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
