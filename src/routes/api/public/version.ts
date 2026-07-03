import { createFileRoute } from "@tanstack/react-router";

// Latest MYRAA desktop app version manifest.
// Bump `version` here whenever you ship a new .exe / feature that needs a rebuild.
// The Electron app polls this endpoint and shows an "Update Available" banner.
const MANIFEST = {
  version: "1.0.9",
  released: "2026-07-03",
  downloadUrl: "https://tmpfiles.org/dl/wrwPjRI1Fjef/myraa-setup-1.0.7.exe",
  portableUrl: "https://tdijnzdeofeylvqscjdv.supabase.co/storage/v1/object/public/releases/MYRAA-win32-x64-latest.zip",
  notes: [
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