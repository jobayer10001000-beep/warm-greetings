import { createFileRoute } from "@tanstack/react-router";

// Latest MYRAA desktop app version manifest.
// Bump `version` here whenever you ship a new .exe / feature that needs a rebuild.
// The Electron app polls this endpoint and shows an "Update Available" banner.
const MANIFEST = {
  version: "1.0.14",
  released: "2026-07-03",
  downloadUrl: "https://tmpfiles.org/dl/wrwPjRI1Fjef/myraa-setup-1.0.7.exe",
  portableUrl: "https://tdijnzdeofeylvqscjdv.supabase.co/storage/v1/object/public/releases/MYRAA-win32-x64-latest.zip",
  notes: [
    "Network fix — 'fetch failed' error hobe na, 3x auto-retry + 30s timeout + clear error message",
    "AUTONOMOUS BRAIN — MYRAA ekhon predefined command list er baire o kaj kore. Novel task (wallpaper change, hotspot, port kill, ip check, custom folder etc.) request korle nije reasoning kore command chain banabe",
    "WhatsApp self-chat detection fix — msg.from/msg.to duitoi check kore, command miss hobe na",
    "Help/support intent — 'myraa help' / 'sahajjo lagbe' bolle contact info reply diye",
    "First-run owner name popup (portable ZIP users) — installer chara o name set kora jabe",
    "Installer e PC owner name select korar option — MYRAA oi name a dakbe (Sir / Boss / Rupom / anything)",
    "Installer e Windows startup on/off choose kora jay — porei app theke o toggle kora jabe",
    "14+ language dropdown (Bangla, English, Hindi, Urdu, Arabic, Spanish, French, German, Chinese, Japanese, Korean, Portuguese, Russian, Indonesian) — persistent, AI + voice auto-switch",
    "Pure Bangla script reply (বাংলা লিপি) — natural Bengali TTS, no more Banglish garble",
    "Notepad new tab / new window intent (Ctrl+T inside Notepad)",
    "PDF conversion — images & text files to PDF via built-in engine (no ffmpeg needed)",
    "Screenshot save to Desktop\\MYRAA folder (auto-created)",
    "Faster startup — update check delay 4s → 1.5s",
  ],
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(MANIFEST), {
          headers: { "Content-Type": "application/json", ...cors },
        }),
      OPTIONS: () => new Response(null, { headers: cors }),
    },
  },
});