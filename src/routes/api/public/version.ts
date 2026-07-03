import { createFileRoute } from "@tanstack/react-router";

// Latest MYRAA desktop app version manifest.
// Bump `version` here whenever you ship a new .exe / feature that needs a rebuild.
// The Electron app polls this endpoint and shows an "Update Available" banner.
const MANIFEST = {
  version: "1.0.7",
  released: "2026-07-03",
  downloadUrl: "https://tmpfiles.org/dl/wrwPjRI1Fjef/myraa-setup-1.0.7.exe",
  portableUrl: "https://tdijnzdeofeylvqscjdv.supabase.co/storage/v1/object/public/releases/MYRAA-win32-x64-latest.zip",
  notes: [
    "Local command brain — backend bhul korleo stop/open/convert age app nije bujhe ney",
    "YouTube stop/pause/bondho command ekhon video play kore na, running media pause kore",
    "File name bole open korle Desktop/Downloads/Documents/Pictures/Videos/Music theke khuje open kore",
    "Basic file convert support — image/text/media common formats",
    "Direct single professional installer build",
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