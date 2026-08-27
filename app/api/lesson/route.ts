import { LESSON_SYSTEM_PROMPT, buildLessonUserPrompt, type Lesson } from "@/lib/prompt";

// OpenRouter is OpenAI-compatible, so a plain fetch call is enough —
// no SDK dependency needed for one endpoint. Model is swappable via env var.
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "openrouter/free";
// Keep the reservation below the free balance reported by OpenRouter.
const OPENROUTER_MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS ?? 2500);

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel: allow the single LLM call room to finish

// ponytail: size cap prevents a huge file from blowing context/cost.
// One guard here covers every caller — no per-route duplication needed
// since this is the only route that accepts file content.
const MAX_CHARS = 120_000; // ~roughly 2000-3000 lines of typical source

export async function POST(req: Request) {
  try {
    const { filename, code } = await req.json();

    if (typeof code !== "string" || typeof filename !== "string" || !code.trim()) {
      return Response.json({ error: "Missing filename or code." }, { status: 400 });
    }
    if (code.length > MAX_CHARS) {
      return Response.json(
        { error: `File too large (max ~${MAX_CHARS.toLocaleString()} characters for v1).` },
        { status: 413 }
      );
    }
    // Reject obvious binary content (null bytes) — cheap sanity check, not a full MIME sniff.
    if (code.includes("\u0000")) {
      return Response.json({ error: "File does not appear to be text." }, { status: 400 });
    }

    const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        // Optional but recommended by OpenRouter for their leaderboards/rate limiting.
        "HTTP-Referer": process.env.SITE_URL ?? "https://localhost:3000",
        "X-Title": "Learn From Code",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: OPENROUTER_MAX_TOKENS,
        messages: [
          { role: "system", content: LESSON_SYSTEM_PROMPT },
          { role: "user", content: buildLessonUserPrompt(filename, code) },
        ],
      }),
    });

    if (!orRes.ok) {
      const errBody = await orRes.text();
      return Response.json(
        { error: `OpenRouter error: ${errBody}` },
        { status: orRes.status === 402 ? 402 : 502 }
      );
    }

    const data = await orRes.json();
    const text: string | undefined = data.choices?.[0]?.message?.content;
    if (!text) {
      return Response.json({ error: "No response from model." }, { status: 502 });
    }

    const cleaned = text.trim().replace(/^```json\s*|```$/g, "");
    let lesson: Lesson;
    try {
      lesson = JSON.parse(cleaned);
    } catch {
      return Response.json({ error: "Model returned invalid JSON." }, { status: 502 });
    }

    return Response.json({ lesson, filename });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
