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
        const out = path.join(app.getPath("desktop"), `myraa-${Date.now()}.png`);
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

async function openYoutubePlay(query) {
  const q = String(query || "").trim();
  if (!q) {
    await shell.openExternal("https://www.youtube.com");
    return { ok: true, out: "youtube" };
  }
  // sp=EgIQAQ%3D%3D restricts to Type:Video (no Shorts, Mixes, Playlists, Channels)
  // → the first videoRenderer is the true top match, not a "People also watched" shelf.
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIQAQ%253D%253D`;
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    // Only pick real video results (videoRenderer). Skip shorts, mixes, ads, shelves, radio.
    let pick = null;
    // Walk every videoRenderer and skip ones inside a shortsShelf/reelShelf/promotedVideo block.
    const rendererRe = /"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})"/g;
    let m;
    while ((m = rendererRe.exec(html))) {
      const around = html.slice(Math.max(0, m.index - 400), m.index);
      if (/reelShelfRenderer|shortsLockupViewModel|promotedVideoRenderer|adSlotRenderer/.test(around)) continue;
      pick = m[1];
      break;
    }
    if (!pick) {
      // Fallback: first /watch?v= link
      const w = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
      if (w) pick = w[1];
    }
    if (pick) {
      const watch = `https://www.youtube.com/watch?v=${pick}&autoplay=1`;
      await shell.openExternal(watch);
      return { ok: true, out: `playing ${q}` };
    }
  } catch (e) {
    console.log("[myraa] youtube play fallback:", e.message);
  }
  await shell.openExternal(searchUrl);
  return { ok: true, out: `youtube search ${q}` };
}

function directIntent(payload) {
  const raw = typeof payload === "string" ? payload : String(payload?.prompt || "");
  const text = raw.replace(/^\[[^\]]+\]\s*/g, "").replace(/^\[WHATSAPP\]\s*/i, "").trim();
  const lower = text.toLowerCase();

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
  const wantsPlay = /\b(play|chalao|chala|chalaw|bajao|baja|gaan|song|music|gan)\b|চাল|বাজ|গান/i.test(lower);
  // If the user asks to play a song/music (even without saying "youtube"), route to YouTube.
  if (!mentionsYoutube && !wantsPlay) return null;
  let query = text
    .replace(/hey\s+myraa|hi\s+myraa|myraa|mayra|miraa/gi, " ")
    .replace(/youtube|yt|ইউটিউব/gi, " ")
    .replace(/open|khol|kholo|khule|search|sarch|khoj|khujo|play|this song|song|gaan|ta|e|a|te|kore|dao|daw|please/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!query && /youtube\s+(?:e\s+)?(.+)/i.test(text)) query = RegExp.$1.trim();
  if (!query) {
    return {
      reply: "hae Sir, YouTube khule dicchi.",
      commands: [{ type: "open_url", url: "https://www.youtube.com" }],
    };
  }
  return {
    reply: wantsPlay
      ? `hae Sir, YouTube e ${query} play kore dicchi.`
      : `hae Sir, YouTube e ${query} search kore dicchi.`,
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
ipcMain.handle("myraa:tts", async (_e, text) => {
  const t = String(text || "").slice(0, 1000);
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
  await sleep(4000);
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
