// MYRAA TTS — public edge function. ElevenLabs female voice for MYRAA replies.
// Returns MP3 audio.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Monika Sogam — native Bengali female voice, pure Bangla accent (no British/Indian tone).
// Multilingual v2 model gives the most accurate Bangla pronunciation.
// Sarah — warm multilingual female (Bangla via eleven_multilingual_v2).
// Monika Sogam requires ElevenLabs Creator tier, so we default to a free-tier voice.
const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL";

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
          // NOTE: language_code param is NOT supported on multilingual_v2 — it 400s.
          // The model auto-detects Bangla from Unicode / Banglish text.
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.4,
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
