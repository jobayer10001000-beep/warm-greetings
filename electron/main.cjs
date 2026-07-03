// MYRAA — Electron main process (self-contained desktop app)
// UI: electron/ui.html. AI: Lovable Edge Function. TTS: ElevenLabs via Edge Function.
// OS control: nut-js (optional) + shell/PowerShell fallbacks. Screen vision: desktopCapturer.

const { app, BrowserWindow, ipcMain, shell, dialog, desktopCapturer, screen, Tray, Menu, Notification, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const os = require("os");
const http = require("http");

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
      case "shutdown":   return sh("shutdown /s /t 10");
      case "restart":    return sh("shutdown /r /t 10");
      case "logout":     return sh("shutdown /l");
      case "cancel":     return sh("shutdown /a");
      case "screenshot": {
        const out = path.join(app.getPath("pictures"), `myraa-${Date.now()}.png`);
        return ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${out.replace(/\\/g,"\\\\")}'); Write-Output '${out.replace(/\\/g,"\\\\")}'`);
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

const APP_ALIASES_WIN = {
  chrome: "chrome", firefox: "firefox", edge: "msedge",
  spotify: "spotify:", code: "code", vscode: "code",
  explorer: "explorer.exe", files: "explorer.exe", "file explorer": "explorer.exe",
  notepad: "notepad.exe", calc: "calc.exe", calculator: "calc.exe",
  cmd: "cmd.exe", powershell: "powershell.exe", terminal: "wt.exe",
  discord: "discord:", telegram: "tg://", whatsapp: "whatsapp:",
  paint: "mspaint.exe", word: "winword", excel: "excel", ppt: "powerpnt",
};

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
      case "type":
      case "key_type":   return typeText(cmd.text || "");
      case "key_tap":    return keyTap(cmd.key, cmd.modifiers || []);
      case "exec":       return sh(cmd.command);
      case "wait":       await sleep(cmd.ms || 1000); return { ok: true, out: `waited ${cmd.ms||1000}ms` };
      case "mouse_click":return mouseClick(cmd.x|0, cmd.y|0);
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

const TTS_URL = "https://tdijnzdeofeylvqscjdv.supabase.co/functions/v1/myraa-tts";
ipcMain.handle("myraa:tts", async (_e, text) => {
  try {
    const res = await fetch(TTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: String(text || "").slice(0, 1000) }),
    });
    if (!res.ok) return { error: `TTS ${res.status}` };
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
  const cfg = readConfig();
  const url = cfg.backendUrl && /^https?:\/\//.test(cfg.backendUrl) ? cfg.backendUrl : DEFAULT_BACKEND;
  const body = typeof payload === "string"
    ? { prompt: payload, platform: plat }
    : { prompt: String(payload?.prompt || ""), platform: plat, image: payload?.image || undefined };
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
