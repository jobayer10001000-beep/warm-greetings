import { createFileRoute } from "@tanstack/react-router";

const SYSTEM_PROMPT = `You are MYRAA — Rupom's personal Windows desktop AI assistant.
Personality: professional friendly Banglish (Bangla+English). Address user as "Sir" or "Boss". Replies under 2 lines.

Translate the user request into a JSON object with:
- "reply": short Banglish response.
- "commands": ordered array of commands to execute on the PC.

Command types:
- {"type":"exec","command":"..."}    — any shell/cmd/powershell command.
- {"type":"launch","target":"..."}   — aliases: chrome, firefox, edge, spotify, code, explorer, notepad, calc, cmd, powershell, discord, telegram, whatsapp, paint, word, excel. Or full path.
- {"type":"key_tap","key":"...","modifiers":["ctrl"|"alt"|"shift"|"meta"]}
- {"type":"key_type","text":"..."}   — type literal text.
- {"type":"media","action":"play_pause|next|prev|vol_up|vol_down|mute"}
- {"type":"system","action":"lock|sleep|shutdown|restart|logout|cancel|screenshot"}
- {"type":"open_url","url":"https://..."}
- {"type":"search_web","query":"..."}
- {"type":"youtube_play","query":"..."} — play exact requested YouTube song/video.
- {"type":"open_file","target":"..."} — open local file by spoken name.
- {"type":"open_folder","target":"downloads|desktop|documents|pictures|videos|music|home"} — open local folder.
- {"type":"convert_file","target":"...","format":"png|jpg|webp|txt|html|mp3|mp4|..."} — convert local file when supported.

Rules:
- "gmail open koro" → open_url https://mail.google.com
- "youtube e <song name> play koro" / song play requests → youtube_play with query exactly equal to the song name. Example: "fakiraa slowed reverb song play koro" → {"type":"youtube_play","query":"fakiraa slowed reverb"}
- "youtube/video/song stop/pause/bondho/thamao" → {"type":"media","action":"pause"}; never play/search a video for stop requests.
- "youtube <q> search" → open_url https://www.youtube.com/results?search_query=<q>
- "<file name> file open koro" → {"type":"open_file","target":"<file name>"}
- "downloads/documents/desktop/pictures/videos/music folder kholo" → {"type":"open_folder","target":"downloads|documents|desktop|pictures|videos|music"}
- "<file name> convert to <format>" → {"type":"convert_file","target":"<file name>","format":"<format>"}
- "google search <q>" → search_web
- "type X" / "paste X" → key_type
- Pure chat → commands: [].
- OUTPUT ONLY VALID JSON. No markdown, no code fences, no extra text.`;

function extractYoutubeQuery(text: string) {
  let query = text
    .replace(/^\[[^\]]+\]\s*/g, " ")
    .replace(/[“”"']/g, " ")
    .replace(/\b(hey|hi|hello)\s+(myraa|mayra|miraa)\b/gi, " ")
    .replace(/\b(myraa|mayra|miraa)\b/gi, " ")
    .replace(/\b(youtube|yt)\b|ইউটিউব/gi, " ")
    .replace(/\b(open|khol|kholo|khule|search|sarch|khoj|khujo|find|play|replay|this|video|song|gaan|gan|music|chalao|chala|chalaw|bajao|baja|kor|koro|kore|dao|daw|den|please|plz)\b/gi, " ")
    .replace(/\b(e|a|te|ta|er|theke|to|for|on|in)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const quoted = text.match(/["“”']([^"“”']{2,})["“”']/);
  if (quoted?.[1]) query = quoted[1].trim();
  return query;
}

function directYoutubeIntent(prompt: string) {
  const text = prompt.replace(/^\[[^\]]+\]\s*/g, "").trim();
  const lower = text.toLowerCase();
  const wantsStop = /\b(stop|pause|bondho|bandho|band|tham|thamao|off)\b|বন্ধ|থাম|পজ/i.test(lower);
  const mediaContext = /\b(youtube|yt|video|song|gaan|gan|music|audio|media)\b|ইউটিউব|ভিডিও|গান/i.test(lower);
  if (wantsStop && mediaContext) return { reply: "hae Sir, cholte thaka video/audio stop kore dicchi.", commands: [{ type: "media", action: "pause" }] };
  const mentionsYoutube = /\b(youtube|yt)\b|ইউটিউব/i.test(lower);
  const wantsPlay = /\b(play|replay|chalao|chala|chalaw|bajao|baja|gaan|song|music|gan)\b|চাল|বাজ|গান/i.test(lower);
  if (!mentionsYoutube && !wantsPlay) return null;

  const query = extractYoutubeQuery(text);
  if (!query) {
    return { reply: "hae Sir, YouTube khule dicchi.", commands: [{ type: "open_url", url: "https://www.youtube.com" }] };
  }
  return {
    reply: wantsPlay
      ? `hae Sir, YouTube e "${query}" play kore dicchi.`
      : `hae Sir, YouTube e "${query}" search kore dicchi.`,
    commands: wantsPlay
      ? [{ type: "youtube_play", query }]
      : [{ type: "open_url", url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` }],
  };
}

export const Route = createFileRoute("/api/public/myraa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cors = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        };
        try {
          const { prompt, platform } = (await request.json()) as {
            prompt?: string;
            platform?: string;
          };
          if (!prompt) {
            return new Response(JSON.stringify({ error: "prompt required" }), {
              status: 400,
              headers: { "Content-Type": "application/json", ...cors },
            });
          }
          const direct = directYoutubeIntent(prompt);
          if (direct) {
            return new Response(JSON.stringify(direct), {
              headers: { "Content-Type": "application/json", ...cors },
            });
          }
          const key = process.env.LOVABLE_API_KEY;
          if (!key) {
            return new Response(JSON.stringify({ error: "server key missing" }), {
              status: 500,
              headers: { "Content-Type": "application/json", ...cors },
            });
          }

          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Lovable-API-Key": key,
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `Platform: ${platform || "win32"}\nUser: ${prompt}` },
              ],
              response_format: { type: "json_object" },
            }),
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            return new Response(
              JSON.stringify({ error: `AI ${res.status}: ${txt.slice(0, 200)}` }),
              { status: 502, headers: { "Content-Type": "application/json", ...cors } },
            );
          }

          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const content = data?.choices?.[0]?.message?.content || "{}";
          let parsed: { reply?: string; commands?: unknown[] };
          try {
            parsed = JSON.parse(content);
          } catch {
            const m = content.match(/\{[\s\S]*\}/);
            parsed = m ? JSON.parse(m[0]) : { reply: content, commands: [] };
          }

          return new Response(
            JSON.stringify({
              reply: parsed.reply || "OK Sir.",
              commands: Array.isArray(parsed.commands) ? parsed.commands : [],
            }),
            { headers: { "Content-Type": "application/json", ...cors } },
          );
        } catch (e) {
          return new Response(
            JSON.stringify({ error: (e as Error).message || String(e) }),
            { status: 500, headers: { "Content-Type": "application/json", ...cors } },
          );
        }
      },
      OPTIONS: () =>
        new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }),
    },
  },
});
