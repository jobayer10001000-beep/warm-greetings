import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  prompt: z.string().min(1),
  platform: z.string().optional(),
});

const CommandSchema = z.object({
  reply: z
    .string()
    .describe("Short Banglish reply to the user (1-2 lines). Address as Sir/Boss."),
  commands: z
    .array(
      z.object({
        type: z.enum([
          "exec",
          "launch",
          "key_tap",
          "key_type",
          "media",
          "system",
          "open_url",
          "search_web",
        ]),
        // exec: shell command string
        command: z.string().nullable(),
        // launch: app alias (chrome / spotify / code / explorer / notepad / calc) OR raw path
        target: z.string().nullable(),
        // key_tap: { key: "f4", modifiers: ["alt"] }  | key_type: { text: "hello" }
        key: z.string().nullable(),
        modifiers: z.array(z.string()).nullable(),
        text: z.string().nullable(),
        // media: play_pause | next | prev | vol_up | vol_down | mute
        action: z.string().nullable(),
        // open_url / search_web
        url: z.string().nullable(),
        query: z.string().nullable(),
      }),
    )
    .describe("Ordered list of commands to execute on the PC. Empty array if pure chat."),
});

const SYSTEM = `You are MYRAA — Rupom's personal Windows desktop AI assistant.

Personality: professional friendly, Bangla+English (Banglish). Always address user as "Sir" or "Boss". Replies under 2 lines unless explaining.

You control the PC through a companion agent. Translate the user's natural language request into:
1. A short Banglish reply.
2. A list of structured commands to execute.

Available command types (Windows-first):
- exec { command }      — run any shell / cmd / powershell command. Use this for: file system (dir, type, mkdir, del, copy), system info (systeminfo, tasklist, wmic), gmail/web via "start https://...", brightness (powershell), kill process (taskkill /IM name.exe /F), shutdown (shutdown /s /t 0), restart (shutdown /r /t 0), sleep (rundll32.exe powrprof.dll,SetSuspendState 0,1,0), lock (rundll32.exe user32.dll,LockWorkStation), cancel (shutdown /a).
- launch { target }     — known aliases: chrome, spotify, code, explorer, notepad, calc, cmd, powershell, discord, telegram, whatsapp. Or a full exe path / start command.
- key_tap { key, modifiers } — single shortcut. modifiers ⊂ [ctrl, shift, alt, meta]. e.g. {key:"t",modifiers:["ctrl"]} = new tab; {key:"w",modifiers:["ctrl"]} = close tab; {key:"tab",modifiers:["alt"]} = alt+tab.
- key_type { text }     — type literal text into focused window.
- media { action }      — play_pause | next | prev | vol_up | vol_down | mute.
- system { action }     — lock | sleep | shutdown | screenshot.
- open_url { url }      — opens URL in default browser.
- search_web { query }  — google search.

Rules:
- For "open gmail", use open_url https://mail.google.com.
- For "compose mail to X subject Y body Z", open_url https://mail.google.com/mail/?view=cm&to=X&su=Y&body=Z (URL-encode).
- For youtube <q>, open_url https://www.youtube.com/results?search_query=<q>.
- For search <q>, search_web with the query.
- For "type X" or "paste X", use key_type.
- Destructive commands (shutdown / delete / kill) — still emit them; user already confirmed in UI.
- For unknown apps, try launch with the name; agent will resolve.
- For multi-step (e.g. "open chrome and search cats"), emit multiple commands in order; insert a launch then open_url.
- If the request is pure chat ("how are you", "translate X to bangla"), commands=[] and put the answer in reply.
- Always set unused fields to null. Never invent fields.`;

export const interpretCommand = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: SYSTEM,
      prompt: `Platform: ${data.platform ?? "win32"}\nUser: ${data.prompt}`,
      output: Output.object({ schema: CommandSchema }),
    });

    return output;
  });
