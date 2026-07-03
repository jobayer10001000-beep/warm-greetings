import { createFileRoute } from "@tanstack/react-router";

// Latest MYRAA desktop app version manifest.
// Bump `version` here whenever you ship a new .exe / feature that needs a rebuild.
// The Electron app polls this endpoint and shows an "Update Available" banner.
const MANIFEST = {
  version: "1.1.1",
  released: "2026-07-03",
  downloadUrl: "https://tdijnzdeofeylvqscjdv.supabase.co/storage/v1/object/public/releases/MYRAA-Setup-latest.exe",
  portableUrl: "https://tdijnzdeofeylvqscjdv.supabase.co/storage/v1/object/public/releases/MYRAA-win32-x64-latest.zip",
  notes: [
    "50+ notun powerful command hardcoded (system, files, design, dev, chain modes)",
    "Shutdown ekhon instant (0 second, force close)",
    "In-app update system — notun version pele auto-notify",
    "YouTube song play exact name match kore — fakiraa slowed reverb er moto query ar vange na",
    "Discord/Photoshop/Premiere er jonno window-ready tracker",
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