import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Mic, MicOff, Send, Globe, Eye, Terminal, Loader2,
  X, Power, Lock, Camera, Volume2, Cpu,
} from "lucide-react";
import { useAgent, type AgentCommand } from "@/lib/use-agent";
import { interpretCommand } from "@/lib/myraa-ai.functions";
import earthImg from "@/assets/earth.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MYRAA — Neural Desktop Companion" },
      { name: "description", content: "Rupom's personal AI desktop assistant. Install, chat, and control your PC with natural language." },
    ],
  }),
  component: Dashboard,
});

type Msg = { id: string; role: "user" | "myraa" | "system"; text: string; ts: number };

function Dashboard() {
  const { status, isDesktop, info, send, log } = useAgent();
  const interpret = useServerFn(interpretCommand);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [showConsole, setShowConsole] = useState(false);
  const [muted, setMuted] = useState(true);
  const [lang, setLang] = useState<"BANGLA" | "ENGLISH">("BANGLA");

  const convoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    convoRef.current?.scrollTo({ top: convoRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const add = (m: Omit<Msg, "id" | "ts">) =>
    setMessages((x) => [...x, { ...m, id: crypto.randomUUID(), ts: Date.now() }]);

  async function submit(text: string) {
    const q = text.trim();
    if (!q || thinking) return;
    add({ role: "user", text: q });
    setInput("");
    setThinking(true);
    try {
      const res = await interpret({ data: { prompt: `[${lang}] ${q}` } });
      add({ role: "myraa", text: res.reply });
      for (const cmd of res.commands) {
        const c: AgentCommand = {
          type: cmd.type,
          command: cmd.command ?? undefined,
          target: cmd.target ?? undefined,
          key: cmd.key ?? undefined,
          modifiers: cmd.modifiers ?? undefined,
          text: cmd.text ?? undefined,
          action: cmd.action ?? undefined,
          url: cmd.url ?? undefined,
          query: cmd.query ?? undefined,
        };
        await send(c);
      }
    } catch (e) {
      add({ role: "system", text: `error: ${(e as Error).message}` });
    } finally {
      setThinking(false);
    }
  }

  const dot =
    status === "desktop"
      ? "bg-primary shadow-[0_0_12px_var(--color-primary)]"
      : "bg-amber-400";

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <header className="relative z-20 flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/40 grid place-items-center glow-cyan">
            <span className="font-display text-xl text-primary glow-text">M</span>
          </div>
          <div>
            <h1 className="font-display text-2xl font-black text-primary glow-text leading-none">MYRAA</h1>
            <p className="font-display text-[10px] text-muted-foreground mt-1">NEURAL COMPANION · v0.3</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang((l) => (l === "BANGLA" ? "ENGLISH" : "BANGLA"))}
            className="glass rounded-full px-4 h-9 flex items-center gap-2 text-xs font-display tracking-wider hover:border-primary/50 transition"
          >
            <Globe className="w-3.5 h-3.5 text-primary" /> {lang}
          </button>
          <IconChip onClick={() => setShowConsole((s) => !s)} title="Console">
            <Terminal className="w-4 h-4" />
          </IconChip>
          <div className="glass rounded-full px-3 h-9 flex items-center gap-2 text-[10px] font-display tracking-widest">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            {isDesktop ? `DESKTOP · ${info?.platform ?? "…"}` : "BROWSER MODE"}
          </div>
        </div>
      </header>

      {!isDesktop && (
        <div className="relative z-20 mx-6 mb-3 glass rounded-2xl p-4 float-up flex items-start gap-3 border-amber-400/40">
          <Cpu className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed">
            <div className="font-display tracking-wider text-amber-300 mb-1">BROWSER PREVIEW MODE</div>
            <p className="text-muted-foreground">
              MYRAA can chat here, but to actually control your PC, run the bundled desktop app
              (<code className="text-primary">MYRAA.exe</code>). Build it with <code className="text-primary">npm run electron:build</code>.
            </p>
          </div>
        </div>
      )}

      <main className="relative z-10 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 px-6 pb-32">
        <section className="relative flex items-center justify-center min-h-[480px] lg:min-h-[640px]">
          <div className="relative">
            <div className="absolute inset-0 -m-16 rounded-full border border-primary/15 orbit-spin" />
            <div className="absolute inset-0 -m-8 rounded-full border border-primary/10" />
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-3xl glow-pulse" />
            <img
              src={earthImg}
              alt="Earth"
              width={520}
              height={520}
              className="relative w-[280px] h-[280px] sm:w-[400px] sm:h-[400px] lg:w-[520px] lg:h-[520px] rounded-full earth-spin select-none drop-shadow-[0_0_60px_hsl(188_100%_55%/0.4)]"
              draggable={false}
            />
            <svg className="absolute inset-0 pointer-events-none orbit-spin" viewBox="0 0 520 520">
              <ellipse cx="260" cy="260" rx="245" ry="80" fill="none" stroke="hsl(188 100% 55% / 0.35)" strokeWidth="1" />
              <ellipse cx="260" cy="260" rx="245" ry="120" fill="none" stroke="hsl(188 100% 55% / 0.2)" strokeWidth="1" transform="rotate(35 260 260)" />
              <ellipse cx="260" cy="260" rx="245" ry="100" fill="none" stroke="hsl(280 100% 70% / 0.25)" strokeWidth="1" transform="rotate(-30 260 260)" />
              {[...Array(8)].map((_, i) => (
                <circle key={i} cx={260 + Math.cos(i) * 240} cy={260 + Math.sin(i * 2) * 100} r="2"
                  fill="hsl(188 100% 70%)" opacity="0.8" />
              ))}
            </svg>
          </div>
        </section>

        <aside className="glass rounded-2xl p-5 flex flex-col h-[640px]">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm tracking-widest text-primary glow-text">CONVERSATION</h2>
            <span className="text-[10px] font-mono text-muted-foreground">{messages.length} msg</span>
          </div>
          <div ref={convoRef} className="flex-1 overflow-y-auto pr-1 space-y-3 text-sm">
            {messages.length === 0 && (
              <div className="text-muted-foreground italic text-sm">
                Say hi to Myraa — bolun "youtube khol", "volume baraw", "lock kor"…
              </div>
            )}
            {messages.map((m) => <Bubble key={m.id} m={m} />)}
            {thinking && (
              <div className="flex gap-1 items-center text-primary text-xs font-display tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                MYRAA IS THINKING…
              </div>
            )}
          </div>
        </aside>
      </main>

      <div className="fixed bottom-0 inset-x-0 z-30 px-6 pb-6 pt-3 bg-gradient-to-t from-background via-background/90 to-transparent">
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="max-w-3xl mx-auto glass rounded-full p-2 flex items-center gap-2 glow-cyan"
        >
          <button type="button" onClick={() => setMuted((m) => !m)}
            className="w-11 h-11 rounded-full bg-secondary/60 grid place-items-center hover:bg-secondary transition">
            {muted ? <MicOff className="w-4 h-4 text-muted-foreground" /> : <Mic className="w-4 h-4 text-primary" />}
          </button>
          <input
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Talk to Myraa…"
            className="flex-1 bg-transparent outline-none text-base px-3 placeholder:text-muted-foreground/70"
          />
          <button type="submit" disabled={thinking || !input.trim()}
            className="w-11 h-11 rounded-full bg-primary text-primary-foreground grid place-items-center disabled:opacity-30 hover:scale-105 active:scale-95 transition">
            {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
        <p className="text-center text-[10px] font-display tracking-[0.3em] text-muted-foreground/60 mt-3">
          {isDesktop ? "DESKTOP MODE · DIRECT OS CONTROL" : "PREVIEW MODE · BUILD DESKTOP APP FOR FULL CONTROL"}
        </p>
      </div>

      <div className="fixed left-6 top-1/2 -translate-y-1/2 z-20 hidden lg:flex flex-col gap-2">
        <QuickAct icon={<Lock />} label="Lock" onClick={() => send({ type: "system", action: "lock" })} />
        <QuickAct icon={<Camera />} label="Shot" onClick={() => send({ type: "exec", command: "snippingtool /clip" })} />
        <QuickAct icon={<Volume2 />} label="Vol+" onClick={() => send({ type: "media", action: "vol_up" })} />
        <QuickAct icon={<Eye />} label="Show" onClick={() => setShowConsole((s) => !s)} />
        <QuickAct icon={<Power />} label="Off" danger onClick={() => {
          if (confirm("Shutdown PC in 10s?")) send({ type: "system", action: "shutdown" });
        }} />
      </div>

      {showConsole && (
        <div className="fixed right-6 bottom-28 z-30 w-96 max-h-80 glass rounded-2xl p-4 float-up">
          <div className="flex items-center justify-between mb-2">
            <span className="font-display text-xs tracking-widest text-primary">AGENT CONSOLE</span>
            <button onClick={() => setShowConsole(false)}><X className="w-4 h-4" /></button>
          </div>
          <div className="overflow-y-auto max-h-64 font-mono text-[11px] space-y-1">
            {log.length === 0 && <div className="text-muted-foreground">Nothing yet.</div>}
            {log.map((l, i) => <div key={i} className="text-muted-foreground">{l}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.role === "system") {
    return <div className="text-[11px] font-mono text-destructive/80 float-up">{m.text}</div>;
  }
  const isUser = m.role === "user";
  return (
    <div className={`float-up flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
        isUser
          ? "bg-primary/15 border border-primary/30 text-foreground"
          : "bg-secondary/50 border border-border text-foreground"
      }`}>
        {!isUser && <div className="font-display text-[9px] tracking-widest text-primary mb-0.5">MYRAA</div>}
        <div className="whitespace-pre-wrap leading-snug">{m.text}</div>
      </div>
    </div>
  );
}

function IconChip({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title}
      className="w-9 h-9 glass rounded-full grid place-items-center hover:border-primary/50 transition">
      {children}
    </button>
  );
}

function QuickAct({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-12 h-12 glass rounded-xl grid place-items-center group relative hover:border-primary/50 transition ${danger ? "hover:border-destructive/60" : ""}`}>
      <span className={`w-4 h-4 ${danger ? "text-destructive" : "text-primary"}`}>{icon}</span>
      <span className="absolute left-14 px-2 py-1 rounded bg-popover text-[10px] font-display tracking-wider opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">
        {label}
      </span>
    </button>
  );
}
