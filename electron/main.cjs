// MYRAA — Electron main process (self-contained desktop app)
// UI: electron/ui.html. AI: Lovable Edge Function. TTS: ElevenLabs via Edge Function.
// OS control: nut-js (optional) + shell/PowerShell fallbacks. Screen vision: desktopCapturer.

const { app, BrowserWindow, ipcMain, shell, dialog, desktopCapturer, screen, Tray, Menu, Notification, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const os = require("os");
const http = require("http");
const wa = require("./whatsapp.cjs");

// Single-instance lock so relaunches focus existing window
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

let nut = null;
try {
  nut = require("@nut-tree-fork/nut-js");
  nut.keyboard.config.autoDelayMs = 0;
} catch {
  console.log("[myraa] nut-js not installed — mouse/keyboard sim disabled");
}

const isDev = !app.isPackaged;
const CONFIG_PATH = path.join(app.getPath("userData"), "myraa.config.json");

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); } catch { return {}; }
}
function writeConfig(cfg) {
  try { fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true }); } catch {}
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ─── Owner name (set at install-time via NSIS, editable at runtime) ─────────
function readOwnerFromRegistry() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve("");
    exec('reg query "HKCU\\Software\\MYRAA" /v OwnerName', (err, stdout) => {
      if (err) return resolve("");
      const m = stdout.match(/OwnerName\s+REG_SZ\s+(.+)/i);
      resolve(m ? m[1].trim() : "");
    });
  });
}
async function ensureOwnerName() {
  const cfg = readConfig();
  if (cfg.ownerName && String(cfg.ownerName).trim()) return cfg.ownerName;
  const fromReg = await readOwnerFromRegistry();
  const name = (fromReg || "Sir").trim();
  cfg.ownerName = name;
  writeConfig(cfg);
  return name;
}
function getOwnerName() {
  const cfg = readConfig();
  return (cfg.ownerName && String(cfg.ownerName).trim()) || "Sir";
}

let mainWin = null;
let tray = null;
let quitting = false;

function createWindow() {
  const cfg = readConfig();
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#020611",
    title: "MYRAA — Neural Desktop Companion",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (cfg.dashboardUrl && /^https?:\/\//.test(cfg.dashboardUrl)) {
    mainWin.loadURL(cfg.dashboardUrl).catch(() => mainWin.loadFile(path.join(__dirname, "ui.html")));
  } else {
    mainWin.loadFile(path.join(__dirname, "ui.html"));
  }

  // Hide-to-tray instead of quit on close
  mainWin.on("close", (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWin.hide();
      try {
        new Notification({ title: "MYRAA", body: "Background e chalu ache — tray icon a click koro." }).show();
      } catch {}
    }
  });
  mainWin.on("closed", () => { mainWin = null; });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, "icon.ico");
    const img = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
    tray = new Tray(img);
    const menu = Menu.buildFromTemplate([
      { label: "Show MYRAA", click: () => { if (mainWin) { mainWin.show(); mainWin.focus(); } else createWindow(); } },
      { label: "Phone Bridge", click: () => {
          const url = phoneBridgeUrl();
          dialog.showMessageBox({ type: "info", title: "MYRAA Phone Bridge",
            message: `Phone theke ei URL ta kholo (same WiFi):\n\n${url}\n\nToken: ${getBridgeToken()}` });
        } },
      { type: "separator" },
      { label: "Auto-start on boot", type: "checkbox",
        checked: app.getLoginItemSettings().openAtLogin,
        click: (m) => app.setLoginItemSettings({ openAtLogin: m.checked, args: ["--hidden"] }) },
      { type: "separator" },
      { label: "Quit MYRAA", click: () => { quitting = true; app.quit(); } },
    ]);
    tray.setToolTip("MYRAA — Neural Companion");
    tray.setContextMenu(menu);
    tray.on("click", () => { if (mainWin) { mainWin.isVisible() ? mainWin.hide() : (mainWin.show(), mainWin.focus()); } else createWindow(); });
  } catch (e) { console.log("[myraa] tray failed:", e.message); }
}

// ─── Phone bridge (local HTTP on LAN) ───────────────────────────────────────
const BRIDGE_PORT = 7777;
function getBridgeToken() {
  const cfg = readConfig();
  if (!cfg.bridgeToken) {
    cfg.bridgeToken = Math.random().toString(36).slice(2, 10);
    writeConfig(cfg);
  }
  return cfg.bridgeToken;
}
function localIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === "IPv4" && !n.internal) return n.address;
    }
  }
  return "127.0.0.1";
}
function phoneBridgeUrl() { return `http://${localIP()}:${BRIDGE_PORT}/?t=${getBridgeToken()}`; }

const PHONE_HTML = `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>MYRAA Phone</title><style>body{margin:0;font-family:system-ui;background:#020611;color:#e2e8f0;min-height:100vh;display:flex;flex-direction:column;padding:20px;gap:12px}h1{color:#22d3ee;font-size:20px;margin:0 0 8px}input,button,textarea{font-size:16px;padding:14px;border-radius:12px;border:1px solid rgba(34,211,238,.3);background:rgba(15,23,42,.6);color:#e2e8f0}button{background:#22d3ee;color:#020611;font-weight:700;border:none}button:active{opacity:.7}#log{flex:1;overflow-y:auto;font-family:monospace;font-size:12px;padding:10px;background:rgba(0,0,0,.4);border-radius:8px;white-space:pre-wrap}.row{display:flex;gap:8px}.row>*{flex:1}</style></head><body>
<h1>📱 MYRAA Phone Control</h1>
<textarea id=p rows=2 placeholder="Bolo ki korte hobe... e.g. youtube kholo"></textarea>
<div class=row><button onclick=send()>Send</button><button onclick=rec()>🎤 Voice</button></div>
<div class=row><button onclick=q('media','vol_up')>Vol+</button><button onclick=q('media','vol_down')>Vol-</button><button onclick=q('media','play_pause')>▶︎</button><button onclick=q('media','next')>⏭</button></div>
<div class=row><button onclick=q('system','lock')>🔒 Lock</button><button onclick=q('system','screenshot')>📸 Shot</button></div>
<div id=log></div>
<script>
const T=new URLSearchParams(location.search).get('t')||'';
const log=(m)=>{const d=document.getElementById('log');d.textContent=new Date().toLocaleTimeString()+' • '+m+'\\n'+d.textContent};
async function send(){const t=document.getElementById('p').value.trim();if(!t)return;log('→ '+t);document.getElementById('p').value='';try{const r=await fetch('/ai?t='+T,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:t})});const j=await r.json();log('✓ '+(j.reply||'ok'))}catch(e){log('✗ '+e.message)}}
async function q(type,action){log('→ '+type+' '+action);try{const r=await fetch('/cmd?t='+T,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type,action})});const j=await r.json();log((j.ok?'✓ ':'✗ ')+(j.out||''))}catch(e){log('✗ '+e.message)}}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function rec(){if(!SR)return log('no mic');const r=new SR();r.lang='bn-BD';r.onresult=e=>{document.getElementById('p').value=e.results[0][0].transcript;send()};r.start()}
</script></body></html>`;

function startPhoneBridge() {
  const token = getBridgeToken();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tok = url.searchParams.get("t");
    const send = (code, body, type = "application/json") =>
      res.writeHead(code, { "Content-Type": type, "Access-Control-Allow-Origin": "*" }).end(typeof body === "string" ? body : JSON.stringify(body));

    if (url.pathname === "/" || url.pathname === "/index.html") return send(200, PHONE_HTML, "text/html; charset=utf-8");
    if (tok !== token) return send(401, { error: "bad token" });

    const readBody = () => new Promise((r) => { let d = ""; req.on("data", (c) => d += c); req.on("end", () => r(d)); });

    if (url.pathname === "/cmd" && req.method === "POST") {
      try { const cmd = JSON.parse(await readBody()); const result = await runCommand(cmd); return send(200, result); }
      catch (e) { return send(500, { ok: false, out: e.message }); }
    }
    if (url.pathname === "/ai" && req.method === "POST") {
      try {
        const { prompt } = JSON.parse(await readBody());
        const result = await callAI({ prompt });
        // auto-run commands returned by AI
        for (const c of (result.commands || [])) { try { await runCommand(c); } catch {} }
        return send(200, result);
      } catch (e) { return send(500, { error: e.message }); }
    }
    send(404, { error: "not found" });
  });
  server.listen(BRIDGE_PORT, "0.0.0.0", () => console.log(`[myraa] phone bridge → ${phoneBridgeUrl()}`));
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  startPhoneBridge();
  ensureOwnerName().catch(() => {});
  // Auto-start WhatsApp bridge if user previously enabled it
  const cfg = readConfig();
  if (cfg.waAutoStart) {
    wa.start({
      userDataDir: app.getPath("userData"),
      onCommand: async ({ prompt }) => {
        const result = await callAI({ prompt: `[WHATSAPP] ${prompt}` });
        if (result?.error) return { error: result.error };
        for (const c of (result.commands || [])) { try { await runCommand(c); } catch {} }
        return result;
      },
    }).catch((e) => console.log("[myraa-wa] autostart err", e.message));
  }
  wa.onChange((snap) => { try { mainWin?.webContents.send("myraa:wa:state", snap); } catch {} });
  // If launched with --hidden (auto-start on boot), hide window
  if (process.argv.includes("--hidden")) mainWin?.hide();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("second-instance", () => { if (mainWin) { mainWin.show(); mainWin.focus(); } });
app.on("before-quit", () => { quitting = true; });
// Keep app alive in tray even when all windows are closed
app.on("window-all-closed", (e) => { e.preventDefault?.(); });

// ─── OS command executor ─────────────────────────────────────────────────────
const plat = process.platform;

function sh(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, out: stderr || err.message });
      resolve({ ok: true, out: (stdout || "").trim() });
    });
  });
}
function ps(script) {
  if (plat !== "win32") return Promise.resolve({ ok: false, out: "win32-only" });
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return sh(`powershell -NoProfile -EncodedCommand ${encoded}`);
}

async function systemAction(action) {
  if (plat === "win32") {
    switch (action) {
      case "lock":       return sh("rundll32.exe user32.dll,LockWorkStation");
      case "sleep":      return sh("rundll32.exe powrprof.dll,SetSuspendState 0,1,0");
      case "shutdown":   return sh("shutdown /s /t 0 /f");
      case "restart":    return sh("shutdown /r /t 0 /f");
      case "logout":     return sh("shutdown /l");
      case "cancel":     return sh("shutdown /a");
      case "screenshot": {
        const dir = path.join(app.getPath("desktop"), "MYRAA");
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
        const out = path.join(dir, `screenshot-${new Date().toISOString().replace(/[:.]/g,"-")}.png`);
        const r = await ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${out.replace(/\\/g,"\\\\")}'); Write-Output '${out.replace(/\\/g,"\\\\")}'`);
        if (r.ok) { try { shell.showItemInFolder(out); } catch {} return { ok: true, out }; }
        return r;
      }
    }
  } else if (plat === "darwin") {
    switch (action) {
      case "lock":     return sh("pmset displaysleepnow");
      case "sleep":    return sh("pmset sleepnow");
      case "shutdown": return sh('osascript -e \'tell app "System Events" to shut down\'');
      case "restart":  return sh('osascript -e \'tell app "System Events" to restart\'');
    }
  } else {
    switch (action) {
      case "lock":     return sh("loginctl lock-session");
      case "sleep":    return sh("systemctl suspend");
      case "shutdown": return sh("shutdown -h +1");
    }
  }
  return { ok: false, out: `unknown action ${action}` };
}

async function mediaAction(action) {
  const a = String(action || "").replace(/-/g, "_");
  if (nut) {
    const { keyboard, Key } = nut;
    const map = { play_pause: Key.AudioPlay, play: Key.AudioPlay, pause: Key.AudioPlay,
      next: Key.AudioNext, prev: Key.AudioPrev,
      vol_up: Key.AudioVolUp, vol_down: Key.AudioVolDown, mute: Key.AudioMute };
    if (map[a]) { await keyboard.pressKey(map[a]); await keyboard.releaseKey(map[a]); return { ok: true, out: a }; }
  }
  if (plat === "win32") {
    const map = { vol_up: 175, vol_down: 174, mute: 173, play_pause: 179, play: 179, pause: 179, next: 176, prev: 177 };
    if (map[a]) return ps(`(New-Object -ComObject WScript.Shell).SendKeys([char]${map[a]})`);
  }
  return { ok: false, out: `media ${a} unsupported` };
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function cleanWords(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreYoutubeTitle(title, query) {
  const t = cleanWords(title);
  const q = cleanWords(query);
  if (!t || !q) return 0;
  const qTokens = q.split(" ").filter((w) => w.length > 1);
  let score = 0;
  for (const token of qTokens) {
    if (t.split(" ").includes(token)) score += 5;
    else if (t.includes(token)) score += 2;
  }
  if (t.includes(q)) score += 20;
  if (/\bslowed\b/.test(q) && /\bslowed\b/.test(t)) score += 8;
  if (/\breverb\b/.test(q) && /\breverb\b/.test(t)) score += 8;
  if (/\b(official|lyrics?|audio|music|song)\b/.test(t)) score += 2;
  if (/\b(shorts?|cover|reaction|mix|playlist|radio)\b/.test(t)) score -= 6;
  return score;
}

function pickYoutubeVideo(html, query) {
  const candidates = [];
  const rendererRe = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = rendererRe.exec(html))) {
    const around = html.slice(Math.max(0, m.index - 500), Math.min(html.length, m.index + 4500));
    if (/reelShelfRenderer|shortsLockupViewModel|promotedVideoRenderer|adSlotRenderer/.test(around)) continue;
    const titleMatch = around.match(/"title":\{"runs":\[\{"text":"([^"]+)"/) || around.match(/"title":\{"simpleText":"([^"]+)"/);
    const title = htmlDecode(titleMatch?.[1] || "");
    candidates.push({ id: m[1], title, score: scoreYoutubeTitle(title, query) });
    if (candidates.length >= 18) break;
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.id || null;
}

async function openYoutubePlay(query) {
  const q = String(query || "").trim();
  if (!q) {
    await shell.openExternal("https://www.youtube.com");
    return { ok: true, out: "youtube" };
  }
  // Restrict to Type:Video, then score real videoRenderer titles against the exact spoken song name.
  const params = new URLSearchParams({ search_query: q, sp: "EgIQAQ==" });
  const searchUrl = `https://www.youtube.com/results?${params.toString()}`;
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    let pick = pickYoutubeVideo(html, q);
    if (!pick) {
      // Fallback: first /watch?v= link
      const w = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (w) pick = w[1];
    }
    if (pick) {
      const watch = `https://www.youtube.com/watch?v=${pick}&autoplay=1`;
      await shell.openExternal(watch);
      return { ok: true, out: `playing "${q}"` };
    }
  } catch (e) {
    console.log("[myraa] youtube play fallback:", e.message);
  }
  await shell.openExternal(searchUrl);
  return { ok: true, out: `youtube search "${q}"` };
}

function extractYoutubeQuery(text) {
  let query = String(text || "")
    .replace(/^\[[^\]]+\]\s*/g, " ")
    .replace(/^\[WHATSAPP\]\s*/i, " ")
    .replace(/[“”"']/g, " ")
    .replace(/\b(hey|hi|hello)\s+(myraa|mayra|miraa)\b/gi, " ")
    .replace(/\b(myraa|mayra|miraa)\b/gi, " ")
    .replace(/\b(youtube|yt)\b|ইউটিউব/gi, " ")
    .replace(/\b(open|khol|kholo|khule|search|sarch|khoj|khujo|find|play|replay|this|video|song|gaan|gan|music|chalao|chala|chalaw|bajao|baja|kor|koro|kore|dao|daw|den|please|plz)\b/gi, " ")
    .replace(/\b(e|a|te|ta|er|theke|to|for|on|in)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const quoted = String(text || "").match(/["“”']([^"“”']{2,})["“”']/);
  if (quoted?.[1]) query = quoted[1].trim();
  return query;
}

function hasMediaStopIntent(lower) {
  return /\b(stop|pause|paused|bondho|bandho|band|tham|thamao|off|bondho koro|band koro|thamaw)\b|বন্ধ|থাম|পজ/i.test(lower);
}

function hasMediaContext(lower) {
  return /\b(youtube|yt|video|song|gaan|gan|music|audio|media|player|chrome tab)\b|ইউটিউব|ভিডিও|গান|চলা/i.test(lower);
}

function stripAssistantWords(text) {
  return String(text || "")
    .replace(/^\[[^\]]+\]\s*/g, " ")
    .replace(/^\[WHATSAPP\]\s*/i, " ")
    .replace(/[“”"]/g, " ")
    .replace(/\b(hey|hi|hello)\s+(myraa|mayra|miraa)\b/gi, " ")
    .replace(/\b(myraa|mayra|miraa|sir|boss|please|plz)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstQuoted(text) {
  const m = String(text || "").match(/["“”']([^"“”']{2,})["“”']/);
  return m?.[1]?.trim() || "";
}

function parseFolderIntent(text) {
  const lower = String(text || "").toLowerCase();
  if (!/\b(open|kholo|khol|show|dekhao|folder|directory)\b|খুলো|ফোল্ডার/i.test(lower)) return null;
  const map = [
    { re: /\b(downloads?|download folder)\b|ডাউনলোড/i, target: "downloads", label: "Downloads" },
    { re: /\b(desktop)\b|ডেস্কটপ/i, target: "desktop", label: "Desktop" },
    { re: /\b(documents?|docs|my documents)\b|ডকুমেন্ট/i, target: "documents", label: "Documents" },
    { re: /\b(pictures?|photos?|image folder)\b|ছবি|ফটো/i, target: "pictures", label: "Pictures" },
    { re: /\b(videos?|movie folder)\b|ভিডিও/i, target: "videos", label: "Videos" },
    { re: /\b(music|songs?|audio folder)\b|গান|মিউজিক/i, target: "music", label: "Music" },
  ];
  return map.find((x) => x.re.test(lower)) || null;
}

function parseOpenFileIntent(text) {
  const raw = stripAssistantWords(text);
  const lower = raw.toLowerCase();
  if (/\b(youtube|yt|google|gmail|chrome|edge|firefox|spotify|discord|telegram|whatsapp|facebook|instagram|website|web site|url|link)\b/i.test(lower)) return null;
  const hasOpenWord = /\b(open|kholo|khol|khule|show|dekhao|run|start|play|chalao|chala)\b|খুলো|চালাও|দেখাও/i.test(lower);
  const hasFileHint = /\b(file|folder|pdf|docx?|xlsx?|pptx?|txt|mp3|mp4|mkv|mov|png|jpe?g|webp|gif|photo|image|video|song|gaan|document)\b|ফাইল|ছবি|ভিডিও|গান/i.test(lower);
  if (!hasOpenWord || !hasFileHint) return null;
  let target = firstQuoted(raw) || raw
    .replace(/\b(open|kholo|khol|khule|show|dekhao|run|start|play|chalao|chala|koro|kore|dao|daw|den|ta|eta|ei|oi|the|file|folder|name|nam|er|ke|please|plz)\b/gi, " ")
    .replace(/ফাইল|খুলো|চালাও|দেখাও|করো|নাম/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!target || target.length < 2) return null;
  if (/^(pdf|doc|docx|txt|mp3|mp4|png|jpg|jpeg|video|song|photo|image|file|folder)$/i.test(target)) return null;
  return target;
}

function parseConvertIntent(text) {
  const raw = stripAssistantWords(text);
  const lower = raw.toLowerCase();
  if (!/\b(convert|conversion|rupantor|format|banaw|banao|make)\b|কনভার্ট|রূপান্তর/i.test(lower)) return null;
  const formats = "pdf|jpg|jpeg|png|webp|gif|bmp|tiff|txt|md|html|csv|json|mp3|wav|m4a|mp4|mkv|mov|webm";
  let target = "";
  let format = "";
  const quoted = firstQuoted(raw);
  let m = raw.match(new RegExp(`(?:convert|conversion|rupantor|format|make|banaw|banao)\\s+(.+?)\\s+(?:to|into|as|e|te|a)\\s+(${formats})\\b`, "i"));
  if (!m) m = raw.match(new RegExp(`(.+?)\\s+(?:to|into|as|e|te|a)\\s+(${formats})\\b.*(?:convert|conversion|rupantor|format|banaw|banao|make)`, "i"));
  if (!m) m = raw.match(new RegExp(`(.+?)\\s+(${formats})\\s*(?:e|te|format e)?\\s*(?:convert|banaw|banao|make)`, "i"));
  if (m) {
    target = (quoted || m[1]).trim();
    format = m[2].toLowerCase();
  }
  target = target
    .replace(/\b(file|ta|eta|ei|oi|ke|er|please|plz|convert|conversion|rupantor|format|banaw|banao|make)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!target || !format) return null;
  return { target, format };
}

function appPathSafe(name) {
  try { return app.getPath(name); } catch { return null; }
}

function commonSearchRoots() {
  const roots = ["desktop", "downloads", "documents", "pictures", "videos", "music", "home"].map(appPathSafe).filter(Boolean);
  return [...new Set(roots)];
}

function normalizeFileText(s) {
  return String(s || "").toLowerCase().replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[^a-z0-9\u0980-\u09ff]+/gi, " ").replace(/\s+/g, " ").trim();
}

function scoreCandidatePath(fullPath, query) {
  const base = path.basename(fullPath);
  const b = normalizeFileText(base);
  const q = normalizeFileText(query);
  if (!b || !q) return 0;
  if (base.toLowerCase() === String(query).toLowerCase()) return 1000;
  if (b === q) return 900;
  let score = b.includes(q) ? 500 : 0;
  for (const token of q.split(" ").filter((w) => w.length > 1)) {
    if (b.split(" ").includes(token)) score += 50;
    else if (b.includes(token)) score += 15;
  }
  if (path.extname(query) && base.toLowerCase().endsWith(path.extname(query).toLowerCase())) score += 80;
  return score;
}

function findBestPath(query, opts = {}) {
  const q = String(query || "").trim().replace(/^['"]|['"]$/g, "");
  if (!q) return null;
  const direct = path.resolve(q.replace(/^~(?=$|[\\/])/, appPathSafe("home") || ""));
  if (fs.existsSync(q)) return q;
  if (fs.existsSync(direct)) return direct;
  const wantFiles = opts.files !== false;
  const wantFolders = opts.folders === true;
  let best = null;
  const deadline = Date.now() + (opts.timeoutMs || 3500);
  const skip = new Set(["node_modules", "AppData", ".git", "$Recycle.Bin", "Windows", "Program Files", "Program Files (x86)"]);
  function walk(dir, depth) {
    if (Date.now() > deadline || depth < 0) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (Date.now() > deadline) return;
      if (skip.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const isDir = ent.isDirectory();
      if ((isDir && wantFolders) || (!isDir && wantFiles)) {
        const score = scoreCandidatePath(full, q);
        if (score > (best?.score || 0)) best = { path: full, score };
        if (score >= 900) return;
      }
      if (isDir && depth > 0) walk(full, depth - 1);
    }
  }
  for (const root of commonSearchRoots()) walk(root, opts.depth ?? 4);
  return best && best.score >= 50 ? best.path : null;
}

async function openFolder(target) {
  const key = String(target || "").toLowerCase().trim();
  const folder = ({ downloads: appPathSafe("downloads"), desktop: appPathSafe("desktop"), documents: appPathSafe("documents"), pictures: appPathSafe("pictures"), videos: appPathSafe("videos"), music: appPathSafe("music"), home: appPathSafe("home") })[key]
    || findBestPath(target, { files: false, folders: true, depth: 4 });
  if (!folder) return { ok: false, out: `folder not found: ${target}` };
  const err = await shell.openPath(folder);
  return { ok: !err, out: err || folder };
}

async function openFileByName(target) {
  const found = findBestPath(target, { files: true, folders: false, depth: 5 });
  if (!found) return { ok: false, out: `file not found: ${target}` };
  const err = await shell.openPath(found);
  return { ok: !err, out: err || found };
}

function psQuote(s) { return `'${String(s || "").replace(/'/g, "''")}'`; }
function cmdQuote(s) { return `"${String(s || "").replace(/"/g, '""')}"`; }

function outputPathFor(src, format) {
  const dir = path.dirname(src);
  const base = path.basename(src, path.extname(src));
  let out = path.join(dir, `${base}.${format}`);
  if (path.resolve(out).toLowerCase() === path.resolve(src).toLowerCase()) out = path.join(dir, `${base}-converted.${format}`);
  let i = 1;
  while (fs.existsSync(out)) out = path.join(dir, `${base}-converted-${i++}.${format}`);
  return out;
}

async function convertFile(target, format) {
  const src = findBestPath(target, { files: true, folders: false, depth: 5 });
  const fmt = String(format || "").replace(/^\./, "").toLowerCase();
  if (!src) return { ok: false, out: `file not found: ${target}` };
  if (!fmt) return { ok: false, out: "target format missing" };
  const inExt = path.extname(src).slice(1).toLowerCase();
  const out = outputPathFor(src, fmt);
  // PDF output — use Electron's headless BrowserWindow → printToPDF
  if (fmt === "pdf") {
    try {
      const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true, sandbox: true } });
      let loadUrl;
      if (["png","jpg","jpeg","gif","webp","bmp"].includes(inExt)) {
        const b64 = fs.readFileSync(src).toString("base64");
        const mime = inExt === "jpg" ? "image/jpeg" : `image/${inExt}`;
        loadUrl = `data:text/html,<!doctype html><html><body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center"><img style="max-width:100%;max-height:100vh" src="data:${mime};base64,${b64}"/></body></html>`;
      } else if (["txt","md","csv","log","json","js","ts","css","html","htm"].includes(inExt)) {
        const content = fs.readFileSync(src, "utf8");
        const body = inExt === "html" || inExt === "htm"
          ? content
          : `<pre style="font-family:'Segoe UI',system-ui,sans-serif;white-space:pre-wrap;padding:24px;font-size:13px;line-height:1.55">${content.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</pre>`;
        loadUrl = "data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;color:#111">${body}</body>`);
      } else {
        win.destroy();
        return { ok: false, out: `${inExt || "file"} theke PDF convert supported na (image/text supported).` };
      }
      await win.loadURL(loadUrl);
      const buf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
      fs.writeFileSync(out, buf);
      win.destroy();
      try { shell.showItemInFolder(out); } catch {}
      return { ok: true, out };
    } catch (e) {
      return { ok: false, out: `pdf convert failed: ${e.message}` };
    }
  }
  const imageIn = ["jpg", "jpeg", "png", "bmp", "gif", "tiff"].includes(inExt);
  const imageOut = { jpg: "Jpeg", jpeg: "Jpeg", png: "Png", bmp: "Bmp", gif: "Gif", tiff: "Tiff" }[fmt];
  if (plat === "win32" && imageIn && imageOut) {
    const r = await ps(`Add-Type -AssemblyName System.Drawing; $src=${psQuote(src)}; $dst=${psQuote(out)}; $img=[System.Drawing.Image]::FromFile($src); try { $img.Save($dst, [System.Drawing.Imaging.ImageFormat]::${imageOut}); Write-Output $dst } finally { $img.Dispose() }`);
    if (r.ok) { try { shell.showItemInFolder(out); } catch {} return { ok: true, out }; }
    return r;
  }
  const textIn = ["txt", "md", "csv", "json", "log", "html", "css", "js", "ts"].includes(inExt);
  const textOut = ["txt", "md", "csv", "json", "html"].includes(fmt);
  if (textIn && textOut) {
    const content = fs.readFileSync(src, "utf8");
    const final = fmt === "html" && inExt !== "html"
      ? `<!doctype html><meta charset="utf-8"><pre>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`
      : content;
    fs.writeFileSync(out, final);
    try { shell.showItemInFolder(out); } catch {}
    return { ok: true, out };
  }
  const mediaIn = ["mp4", "mkv", "mov", "webm", "mp3", "wav", "m4a", "aac", "flac"].includes(inExt);
  const mediaOut = ["mp4", "mkv", "mov", "webm", "mp3", "wav", "m4a", "aac", "flac"].includes(fmt);
  if (mediaIn && mediaOut) {
    const has = await sh("where ffmpeg");
    if (!has.ok) return { ok: false, out: "ffmpeg install kora nai — media convert er jonno ffmpeg lagbe" };
    const r = await sh(`ffmpeg -y -i ${cmdQuote(src)} ${cmdQuote(out)}`);
    if (r.ok) { try { shell.showItemInFolder(out); } catch {} return { ok: true, out }; }
    return r;
  }
  return { ok: false, out: `${inExt || "file"} to ${fmt} convert supported na. Image/text/media basic formats supported.` };
}

function directIntent(payload) {
  const raw = typeof payload === "string" ? payload : String(payload?.prompt || "");
  const text = raw.replace(/^\[[^\]]+\]\s*/g, "").replace(/^\[WHATSAPP\]\s*/i, "").trim();
  const lower = text.toLowerCase();

  if (hasMediaStopIntent(lower) && hasMediaContext(lower)) {
    return {
      reply: "hae Sir, cholte thaka video/audio stop kore dicchi.",
      commands: [{ type: "media", action: "pause" }],
    };
  }

  // Notepad new tab / new window (Windows 11 Notepad supports Ctrl+T for tab, Ctrl+N for window)
  if (/\bnotepad\b|নোটপ্যাড/i.test(lower)) {
    const wantsTab = /\b(new tab|tab|notun tab|arekta tab)\b|নতুন ট্যাব/i.test(lower);
    const wantsWindow = /\b(new window|notun window|arekta window|new notepad|arekta notepad)\b|নতুন উইন্ডো/i.test(lower);
    const wantsOpen = /\b(open|kholo|khol|khule|start|chalao|chala)\b|খুলো|চালাও/i.test(lower);
    if (wantsTab) {
      return {
        reply: "hae Sir, Notepad e notun tab khule dicchi.",
        commands: [
          { type: "launch", target: "notepad" },
          { type: "wait_window", match: "Notepad", timeoutMs: 8000 },
          { type: "key_tap", key: "t", modifiers: ["LeftControl"] },
        ],
      };
    }
    if (wantsWindow || wantsOpen) {
      return {
        reply: "hae Sir, Notepad khule dicchi.",
        commands: [{ type: "launch", target: "notepad" }],
      };
    }
  }

  const folderIntent = parseFolderIntent(text);
  if (folderIntent) {
    return {
      reply: `hae Sir, ${folderIntent.label} folder khule dicchi.`,
      commands: [{ type: "open_folder", target: folderIntent.target }],
    };
  }

  const convertIntent = parseConvertIntent(text);
  if (convertIntent) {
    return {
      reply: `hae Sir, "${convertIntent.target}" file ta ${convertIntent.format.toUpperCase()} format e convert korchi.`,
      commands: [{ type: "convert_file", target: convertIntent.target, format: convertIntent.format }],
    };
  }

  const fileIntent = parseOpenFileIntent(text);
  if (fileIntent) {
    return {
      reply: `hae Sir, "${fileIntent}" file ta khujar por open korchi.`,
      commands: [{ type: "open_file", target: fileIntent }],
    };
  }

  // ── Discord: open + wait for UI + Ctrl+K quick-switcher + type server/user ──
  if (/\bdiscord\b|ডিসকর্ড/i.test(lower)) {
    // extract search target after "search", "khoj", "find", "go to", "server", etc.
    let q = "";
    const m = text.match(/(?:search|khoj|khojo|find|go to|open|server|channel|dm)\s+(.+)$/i);
    if (m) q = m[1].trim();
    q = q.replace(/\b(server|channel|dm|please|dao|daw|kore)\b/gi, "").replace(/\s+/g, " ").trim();
    const cmds = [
      { type: "app_search", target: "discord", match: "Discord",
        shortcut: { key: "K", modifiers: ["LeftControl"] },
        query: q, openDelay: 400, typeDelay: 600 },
    ];
    return {
      reply: q
        ? `hae Sir, Discord khule "${q}" search dicchi — load hote deri hole wait korbo.`
        : "hae Sir, Discord khule dicchi.",
      commands: q ? cmds : [{ type: "launch", target: "discord" }],
    };
  }

  // ── Design / editing apps: open + wait ready, optional search/query ──
  const designMap = [
    { re: /\b(photoshop|ফটোশপ|ps)\b/i, target: "photoshop", match: "Photoshop", label: "Photoshop" },
    { re: /\billustrator\b|\bai\b/i, target: "illustrator", match: "Illustrator", label: "Illustrator" },
    { re: /\bpremiere( pro)?\b/i, target: "premiere", match: "Premiere", label: "Premiere Pro" },
    { re: /\bafter ?effects?\b|\bae\b/i, target: "afterfx", match: "After Effects", label: "After Effects" },
    { re: /\bdavinci( resolve)?\b|\bresolve\b/i, target: "resolve", match: "Resolve", label: "DaVinci Resolve" },
    { re: /\bcapcut\b/i, target: "capcut", match: "CapCut", label: "CapCut" },
    { re: /\bfigma\b/i, target: "figma", match: "Figma", label: "Figma" },
    { re: /\bobs( studio)?\b/i, target: "obs64", match: "OBS", label: "OBS" },
  ];
  for (const d of designMap) {
    if (d.re.test(lower)) {
      const isEditing = /\b(edit|editing|graphic|design|thumbnail|banner|poster|video)\b/i.test(lower);
      return {
        reply: `hae Sir, ${d.label} khule dicchi — full load houar por janabo.`,
        commands: [
          { type: "launch", target: d.target },
          { type: "wait_window", match: d.match, timeoutMs: 45000 },
          ...(isEditing ? [] : []),
        ],
      };
    }
  }

  const mentionsYoutube = /\b(youtube|yt)\b|ইউটিউব/i.test(lower);
  const wantsPlay = /\b(play|replay|chalao|chala|chalaw|bajao|baja|gaan|song|music|gan)\b|চাল|বাজ|গান/i.test(lower);
  // If the user asks to play a song/music (even without saying "youtube"), route to YouTube.
  if (!mentionsYoutube && !wantsPlay) return null;
  let query = extractYoutubeQuery(text);

  if (!query && /youtube\s+(?:e\s+)?(.+)/i.test(text)) query = RegExp.$1.trim();
  if (!query) {
    return {
      reply: "hae Sir, YouTube khule dicchi.",
      commands: [{ type: "open_url", url: "https://www.youtube.com" }],
    };
  }
  return {
    reply: wantsPlay
      ? `hae Sir, YouTube e "${query}" play kore dicchi.`
      : `hae Sir, YouTube e "${query}" search kore dicchi.`,
    commands: wantsPlay
      ? [{ type: "youtube_play", query }]
      : [{ type: "open_url", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` }],
  };
}

const APP_ALIASES_WIN = {
  chrome: "chrome", firefox: "firefox", edge: "msedge",
  spotify: "spotify:", code: "code", vscode: "code",
  explorer: "explorer.exe", files: "explorer.exe", "file explorer": "explorer.exe",
  notepad: "notepad.exe", calc: "calc.exe", calculator: "calc.exe",
  cmd: "cmd.exe", powershell: "powershell.exe", terminal: "wt.exe",
  discord: "discord:", telegram: "tg://", whatsapp: "whatsapp:",
  paint: "mspaint.exe", word: "winword", excel: "excel", ppt: "powerpnt",
  photoshop: "photoshop", ps: "photoshop",
  illustrator: "illustrator", ai: "illustrator",
  premiere: "premiere", "premiere pro": "premiere",
  "after effects": "afterfx", aftereffects: "afterfx", ae: "afterfx",
  capcut: "capcut", "davinci resolve": "resolve", davinci: "resolve", resolve: "resolve",
  "adobe audition": "adobe audition", audition: "adobe audition",
  obs: "obs64", "obs studio": "obs64",
  figma: "figma", canva: "canva:",
  steam: "steam://open/main", epic: "com.epicgames.launcher://",
};

// ─── Wait for an app window to appear (readiness tracker) ────────────────────
// Polls the OS until a window matching `match` (substring, case-insensitive)
// is present, then returns. Used to know when Discord/Photoshop/Premiere etc.
// have finished loading so we can safely type search text.
async function waitForWindow(match, timeoutMs = 30000) {
  const needle = String(match || "").trim();
  if (!needle) { await sleep(1500); return { ok: true, out: "waited" }; }
  const t0 = Date.now();
  if (plat === "win32") {
    const script = `
      $needle='${needle.replace(/'/g, "''")}';
      $deadline=(Get-Date).AddMilliseconds(${timeoutMs|0});
      while((Get-Date) -lt $deadline){
        $p = Get-Process | Where-Object { $_.MainWindowTitle -and ($_.MainWindowTitle -match [regex]::Escape($needle) -or $_.ProcessName -match [regex]::Escape($needle)) } | Select-Object -First 1;
        if($p){ Write-Output ("READY:" + $p.ProcessName + ":" + $p.MainWindowTitle); exit 0 }
        Start-Sleep -Milliseconds 400
      }
      Write-Output 'TIMEOUT'`;
    const r = await ps(script);
    const took = Date.now() - t0;
    if (r.out && r.out.startsWith("READY:")) return { ok: true, out: `ready in ${took}ms (${r.out.slice(6)})` };
    return { ok: false, out: `window not ready after ${took}ms` };
  }
  // macOS/Linux: just wait a fixed slice
  await sleep(Math.min(timeoutMs, 4000));
  return { ok: true, out: `waited (no window probe on ${plat})` };
}

// Focus front window then send a shortcut + type query. Used for in-app search
// (Discord Ctrl+K, Photoshop file open, Premiere media browser, etc.)
async function appSearch({ target, match, shortcut, query, openDelay = 0, typeDelay = 400 }) {
  const launch = await launchApp(target);
  if (!launch.ok) return launch;
  if (openDelay) await sleep(openDelay);
  const ready = await waitForWindow(match || target, 40000);
  await sleep(typeDelay);
  if (shortcut && shortcut.key) {
    await keyTap(shortcut.key, shortcut.modifiers || []);
    await sleep(500);
  }
  if (query) await typeText(query);
  return { ok: true, out: `${target} search "${query||""}" (${ready.out})` };
}

async function launchApp(target) {
  if (!target) return { ok: false, out: "no target" };
  const key = String(target).toLowerCase().trim();
  if (plat === "win32") {
    const resolved = APP_ALIASES_WIN[key] || target;
    return sh(`start "" "${resolved}"`);
  }
  if (plat === "darwin") return sh(`open -a "${target}"`);
  return sh(`${target} &`);
}

async function typeText(text) {
  if (!text) return { ok: false, out: "no text" };
  if (nut) { await nut.keyboard.type(text); return { ok: true, out: "typed" }; }
  if (plat === "win32") {
    const safe = text.replace(/'/g, "''").replace(/[+^%~(){}[\]]/g, "{$&}");
    return ps(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safe}')`);
  }
  return { ok: false, out: "type needs @nut-tree-fork/nut-js" };
}

async function keyTap(key, modifiers = []) {
  if (!nut) return { ok: false, out: "key tap needs @nut-tree-fork/nut-js" };
  const { keyboard, Key } = nut;
  const norm = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const k = Key[norm(key)] || Key[key.toUpperCase()] || Key[key];
  if (!k) return { ok: false, out: `unknown key ${key}` };
  const mods = (modifiers || []).map((m) => Key[norm(m)]).filter(Boolean);
  if (mods.length) { await keyboard.pressKey(...mods, k); await keyboard.releaseKey(...mods, k); }
  else { await keyboard.pressKey(k); await keyboard.releaseKey(k); }
  return { ok: true, out: `${(modifiers||[]).join("+")}+${key}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Math.min(15000, ms|0))));

async function mouseClick(x, y) {
  if (!nut) return { ok: false, out: "mouse needs @nut-tree-fork/nut-js" };
  await nut.mouse.setPosition(new nut.Point(x, y));
  await nut.mouse.leftClick();
  return { ok: true, out: `click ${x},${y}` };
}

// ─── IPC: OS execute ────────────────────────────────────────────────────────
// ─── Unified command runner (used by IPC + phone bridge) ────────────────────
async function runCommand(cmd) {
  try {
    switch (cmd.type) {
      case "open_url":   if (cmd.url) await shell.openExternal(cmd.url); return { ok: true, out: cmd.url };
      case "search_web": if (cmd.query) await shell.openExternal(`https://www.google.com/search?q=${encodeURIComponent(cmd.query)}`); return { ok: true, out: cmd.query };
      case "launch":     return launchApp(cmd.target || cmd.command);
      case "system":     return systemAction(cmd.action);
      case "media":      return mediaAction(cmd.action);
      case "youtube_play": return openYoutubePlay(cmd.query || cmd.text || cmd.command || cmd.url || "");
      case "open_file":  return openFileByName(cmd.target || cmd.query || cmd.text || cmd.command || "");
      case "open_folder":return openFolder(cmd.target || cmd.query || cmd.text || cmd.command || "");
      case "convert_file": return convertFile(cmd.target || cmd.query || cmd.text || cmd.command || "", cmd.format || cmd.to || cmd.action || "");
      case "type":
      case "key_type":   return typeText(cmd.text || "");
      case "key_tap":    return keyTap(cmd.key, cmd.modifiers || []);
      case "exec":       return sh(cmd.command);
      case "wait":       await sleep(cmd.ms || 1000); return { ok: true, out: `waited ${cmd.ms||1000}ms` };
      case "mouse_click":return mouseClick(cmd.x|0, cmd.y|0);
      case "wait_window": return waitForWindow(cmd.match || cmd.target || "", cmd.timeoutMs || 30000);
      case "app_search":  return appSearch({
        target: cmd.target,
        match: cmd.match || cmd.target,
        shortcut: cmd.shortcut,
        query: cmd.query || "",
        openDelay: cmd.openDelay || 0,
        typeDelay: cmd.typeDelay || 400,
      });
      default:           return { ok: false, out: `unknown cmd ${cmd.type}` };
    }
  } catch (err) {
    return { ok: false, out: err && err.message ? err.message : String(err) };
  }
}

ipcMain.handle("myraa:execute", (_e, cmd) => runCommand(cmd));

ipcMain.handle("myraa:screenshot", async () => {
  try {
    const disp = screen.getPrimaryDisplay();
    const scale = 0.5;
    const w = Math.round(disp.size.width * scale);
    const h = Math.round(disp.size.height * scale);
    const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: w, height: h } });
    const src = sources[0];
    if (!src) return { ok: false, out: "no screen" };
    const jpg = src.thumbnail.toJPEG(60);
    return { ok: true, image: "data:image/jpeg;base64," + jpg.toString("base64") };
  } catch (e) {
    return { ok: false, out: e.message || String(e) };
  }
});

// TTS: call ElevenLabs directly from main process (bypasses edge-function deploy lag).
// Voice: Monika Sogam — native Bengali female. Model: multilingual_v2 for best Bangla accent.
const ELEVEN_KEY = "sk_23c2eb815f5a0bfd271800c941e82829fb1c9f4b86d82997";
// Sarah — warm female voice, handles Bangla + English (Banglish) via multilingual_v2.
// Monika Sogam (Bengali native) requires Creator tier — kept as premium fallback.
const ELEVEN_VOICE = "EXAVITQu4vr4xnSDxMaL";
const ELEVEN_FALLBACK_VOICE = "FGY2WhTYpPnrIDTdsKH5"; // Laura — soft female
async function elevenTTS(text, voiceId) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  return fetch(url, {
    method: "POST",
    headers: { "xi-api-key": ELEVEN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.4, similarity_boost: 0.85, style: 0.35, use_speaker_boost: true },
    }),
  });
}
ipcMain.handle("myraa:tts", async (_e, payload) => {
  const t = String((typeof payload === "string" ? payload : payload?.text) || "").slice(0, 1000);
  const lang = String((typeof payload === "object" && payload?.language) || "").toUpperCase();
  if (!t) return { error: "empty" };
  try {
    let res = await elevenTTS(t, ELEVEN_VOICE);
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.log("[myraa-tts] primary voice failed:", res.status, err.slice(0, 200));
      res = await elevenTTS(t, ELEVEN_FALLBACK_VOICE);
      if (!res.ok) return { error: `TTS ${res.status}` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, audio: "data:audio/mpeg;base64," + buf.toString("base64") };
  } catch (e) {
    return { error: e.message || String(e) };
  }
});

ipcMain.handle("myraa:info", () => ({
  platform: plat, release: os.release(), hostname: os.hostname(),
  user: os.userInfo().username, nut: !!nut, version: app.getVersion(),
  bridge: phoneBridgeUrl(),
}));

const DEFAULT_BACKEND = "https://tdijnzdeofeylvqscjdv.supabase.co/functions/v1/myraa-ai";
async function callAI(payload) {
  const direct = directIntent(payload);
  if (direct) return direct;

  const cfg = readConfig();
  const url = cfg.backendUrl && /^https?:\/\//.test(cfg.backendUrl) ? cfg.backendUrl : DEFAULT_BACKEND;
  const body = typeof payload === "string"
    ? { prompt: payload, platform: plat }
    : {
        prompt: String(payload?.prompt || ""),
        platform: plat,
        image: payload?.image || undefined,
        language: payload?.language || undefined,
      };
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const txt = await res.text().catch(() => ""); return { error: `Backend ${res.status}: ${txt.slice(0, 200)}` }; }
    const out = await res.json();
    if (out.error) return { error: out.error };
    return { reply: out.reply || "OK Sir.", commands: Array.isArray(out.commands) ? out.commands : [] };
  } catch (e) { return { error: (e && e.message) || String(e) }; }
}

ipcMain.handle("myraa:hasKey", () => true);
ipcMain.handle("myraa:setKey", (_e, url) => {
  const cfg = readConfig(); cfg.backendUrl = String(url || "").trim() || DEFAULT_BACKEND; writeConfig(cfg);
  return { ok: true };
});
ipcMain.handle("myraa:ai", (_e, payload) => callAI(payload));
ipcMain.handle("myraa:bridge", () => ({ url: phoneBridgeUrl(), token: getBridgeToken() }));

// ─── WhatsApp bridge IPC ─────────────────────────────────────────────────────
ipcMain.handle("myraa:wa:state", () => wa.getState());
ipcMain.handle("myraa:wa:start", async () => {
  const cfg = readConfig(); cfg.waAutoStart = true; writeConfig(cfg);
  return wa.start({
    userDataDir: app.getPath("userData"),
    onCommand: async ({ prompt }) => {
      const result = await callAI({ prompt: `[WHATSAPP] ${prompt}` });
      if (result?.error) return { error: result.error };
      for (const c of (result.commands || [])) { try { await runCommand(c); } catch {} }
      return result;
    },
  });
});
ipcMain.handle("myraa:wa:stop", async () => {
  const cfg = readConfig(); cfg.waAutoStart = false; writeConfig(cfg);
  return wa.stop();
});
ipcMain.handle("myraa:wa:logout", async () => {
  const cfg = readConfig(); cfg.waAutoStart = false; writeConfig(cfg);
  return wa.logout();
});
ipcMain.handle("myraa:wa:test", async () => wa.sendToSelf("🤖 MYRAA online — self-chat theke command dite paro."));

// ─── Update check ────────────────────────────────────────────────────────────
// Poll a hosted version manifest. If server version > local, show badge.
// User clicks "Update Now" → open download URL in browser (installer OR portable zip).
const VERSION_URL = "https://432e53d1-8db0-4352-85e2-8995d0c88406.lovable.app/api/public/version";

function cmpVer(a, b) {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function checkForUpdate() {
  try {
    const cfg = readConfig();
    const url = cfg.updateUrl && /^https?:\/\//.test(cfg.updateUrl) ? cfg.updateUrl : VERSION_URL;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, out: `check ${res.status}` };
    const manifest = await res.json();
    const current = app.getVersion();
    const hasUpdate = cmpVer(manifest.version, current) > 0;
    return {
      ok: true,
      hasUpdate,
      currentVersion: current,
      latestVersion: manifest.version,
      released: manifest.released || null,
      downloadUrl: manifest.downloadUrl || null,
      portableUrl: manifest.portableUrl || null,
      notes: Array.isArray(manifest.notes) ? manifest.notes : [],
    };
  } catch (e) {
    return { ok: false, out: e.message || String(e) };
  }
}

ipcMain.handle("myraa:update:check", () => checkForUpdate());
ipcMain.handle("myraa:update:download", async (_e, url) => {
  if (!url || !/^https?:\/\//.test(url)) return { ok: false, out: "bad url" };
  await shell.openExternal(url);
  return { ok: true, out: "opened in browser" };
});

// Auto-check on boot + push to renderer if update available
app.whenReady().then(async () => {
  await sleep(1500);
  const info = await checkForUpdate();
  if (info?.hasUpdate) {
    try { mainWin?.webContents.send("myraa:update:available", info); } catch {}
    try {
      new Notification({
        title: `MYRAA v${info.latestVersion} available`,
        body: `Tumi ekhon v${info.currentVersion} chaltecho — update korbe?`,
      }).show();
    } catch {}
  }
  // Re-check every 6 hours
  setInterval(async () => {
    const i = await checkForUpdate();
    if (i?.hasUpdate) { try { mainWin?.webContents.send("myraa:update:available", i); } catch {} }
  }, 6 * 60 * 60 * 1000);
});
