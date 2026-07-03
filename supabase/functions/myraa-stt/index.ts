// MYRAA STT — transcribes WhatsApp voice notes (and any audio) to text
// via Lovable AI Gateway (Gemini supports ogg/opus which is WhatsApp's format).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

// map incoming mime → the `format` field Gemini expects for input_audio.
function fmtOf(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("webm")) return "webm";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("flac")) return "flac";
  return "ogg";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { audio, mimeType, language } = await req.json();
    if (!audio) return json({ error: "audio (base64) required" }, 400);
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY missing on server" }, 500);

    const format = fmtOf(mimeType || "");
    const lang = language || "Bangla or English";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              `You are a transcription engine. Transcribe the attached audio verbatim in ${lang}. ` +
              `Use roman Bangla (Banglish) if the user speaks Bangla, otherwise use plain English. ` +
              `Output ONLY the transcript text — no quotes, no prefix, no explanation.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe this voice message." },
              { type: "input_audio", input_audio: { data: audio, format } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json({ error: `STT ${res.status}: ${t.slice(0, 300)}` }, 502);
    }
    const data = await res.json();
    const text = (data?.choices?.[0]?.message?.content || "").trim();
    return json({ text });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}