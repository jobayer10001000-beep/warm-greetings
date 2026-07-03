// MYRAA TTS — public edge function. ElevenLabs female voice for MYRAA replies.
// Returns MP3 audio.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Monika Sogam — natural Indian-subcontinent female, handles Bangla/Hindi cleanly.
// Multilingual v2 gives the most accurate Bangla pronunciation.
const DEFAULT_VOICE = "9BWtsMINqrJLrRacOk9x"; // Aria — warm, works well with bn via multilingual_v2

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { text, voiceId } = await req.json();
    if (!text) return json({ error: "text required" }, 400);
    const key = Deno.env.get("ELEVENLABS_API_KEY");
    if (!key) return json({ error: "ELEVENLABS_API_KEY missing" }, 500);

    const vid = voiceId || DEFAULT_VOICE;
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${vid}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          // multilingual_v2 = best Bangla accent quality (turbo slips into English intonation).
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.85,
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json({ error: `TTS ${res.status}: ${t.slice(0, 200)}` }, 502);
    }
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", ...cors },
    });
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
