# MYRAA — Desktop App Build Guide

## Windows PC te build korar steps:

### 1. Node.js install (ekbar)
https://nodejs.org theke LTS version namao (18+ hole cholbe).

### 2. Project folder e PowerShell open korun, ei command gulo run korun:

```powershell
npm install
npm install --save-dev electron @electron/packager
npm install @nut-tree-fork/nut-js
```

### 3. App test korte:
```powershell
npx electron .
```
MYRAA window khulbe — rotating Earth dashboard load hobe (internet lagbe).

### 4. `.exe` banate:
```powershell
npx @electron/packager . MYRAA --platform=win32 --arch=x64 --out=release --overwrite --ignore="^/src" --ignore="^/public" --ignore="^/supabase" --ignore="^/.lovable" --ignore="^/dist" --ignore="^/electron-release"
```

Output: `release/MYRAA-win32-x64/MYRAA.exe` — double-click korlei chalu.

## Files:
- `electron/main.cjs` — Electron main process (OS commands + AI proxy)
- `electron/preload.cjs` — secure bridge (window.myraa API)
- Backend: Supabase edge function `myraa-ai` (already deployed)

## Config override (optional):
`%APPDATA%\MYRAA\myraa.config.json`:
```json
{
  "dashboardUrl": "https://your-preview-url.lovable.app/",
  "backendUrl": "https://tdijnzdeofeylvqscjdv.supabase.co/functions/v1/myraa-ai"
}
```
