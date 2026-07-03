import { useCallback, useEffect, useState } from "react";

export type Status = "desktop" | "browser";

export type AgentCommand = {
  type: string;
  command?: string | null;
  target?: string | null;
  key?: string | null;
  modifiers?: string[] | null;
  text?: string | null;
  action?: string | null;
  url?: string | null;
  query?: string | null;
  dx?: number;
  dy?: number;
  button?: "left" | "right" | "middle";
  double?: boolean;
};

type MyraaBridge = {
  isDesktop: true;
  execute: (cmd: AgentCommand) => Promise<{ ok: boolean; out?: string }>;
  info: () => Promise<{ platform: string; user: string; nut: boolean; version: string }>;
};

declare global {
  interface Window {
    myraa?: MyraaBridge;
  }
}

export function useAgent() {
  const [log, setLog] = useState<string[]>([]);
  const [info, setInfo] = useState<{ platform?: string; user?: string; nut?: boolean } | null>(null);

  const isDesktop = typeof window !== "undefined" && !!window.myraa?.isDesktop;
  const status: Status = isDesktop ? "desktop" : "browser";

  const pushLog = useCallback((msg: string) => {
    setLog((l) => [`${new Date().toLocaleTimeString()} · ${msg}`, ...l].slice(0, 80));
  }, []);

  useEffect(() => {
    if (!isDesktop) return;
    window.myraa!.info().then((i) => {
      setInfo(i);
      pushLog(`pc ready · ${i.platform} · ${i.user}${i.nut ? "" : " · (nut-js off)"}`);
    });
  }, [isDesktop, pushLog]);

  const send = useCallback(
    async (cmd: AgentCommand) => {
      const detail =
        cmd.command || cmd.target || cmd.url || cmd.query || cmd.text || cmd.action || cmd.key || "";
      pushLog(`me → ${cmd.type}${detail ? `: ${String(detail).slice(0, 80)}` : ""}`);
      if (!isDesktop) {
        pushLog("⚠ browser mode — install desktop app to execute");
        return false;
      }
      try {
        const res = await window.myraa!.execute(cmd);
        pushLog(res.ok ? `pc ✓ ${res.out ?? ""}` : `pc ✗ ${res.out ?? "failed"}`);
        return res.ok;
      } catch (e) {
        pushLog(`pc ✗ ${(e as Error).message}`);
        return false;
      }
    },
    [isDesktop, pushLog],
  );

  return { status, isDesktop, info, send, log };
}
