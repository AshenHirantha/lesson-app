import { LESSON_SYSTEM_PROMPT, buildLessonUserPrompt, type Lesson } from "@/lib/prompt";

// OpenRouter is OpenAI-compatible, so a plain fetch call is enough —
// no SDK dependency needed for one endpoint. Model is swappable via env var.
const USE_FREE_MODELS = process.env.OPENROUTER_USE_FREE !== "false";
const OPENROUTER_MODEL = USE_FREE_MODELS ? undefined : process.env.OPENROUTER_MODEL;
const FREE_MODELS = (
  process.env.OPENROUTER_FREE_MODELS ??
  "nvidia/nemotron-3.5-content-safety:free, cohere/north-mini-code:free, poolside/laguna-xs-2.1:free"
).split(",").map((model) => model.trim()).filter(Boolean);
const REQUEST_MODELS = USE_FREE_MODELS ? FREE_MODELS : [OPENROUTER_MODEL ?? ""];
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

    let text: string | undefined;
    const failures: string[] = [];
    for (const model of REQUEST_MODELS) {
      let orRes: Response;
      try {
        orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(18_000),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            // Optional but recommended by OpenRouter for their leaderboards/rate limiting.
            "HTTP-Referer": process.env.SITE_URL ?? "https://localhost:3000",
            "X-Title": "Learn From Code",
          },
          body: JSON.stringify({
            model,
            max_tokens: OPENROUTER_MAX_TOKENS,
            messages: [
              { role: "system", content: LESSON_SYSTEM_PROMPT },
              { role: "user", content: buildLessonUserPrompt(filename, code) },
            ],
          }),
        });
      } catch (err: any) {
        failures.push(`${model}: ${err?.message ?? "request timed out"}`);
        continue;
      }

      if (!orRes.ok) {
        const errBody = await orRes.text();
        let detail = errBody;
        try {
          detail = JSON.parse(errBody)?.error?.message ?? errBody;
        } catch {
          // Keep non-JSON provider errors readable.
        }
        failures.push(`${model}: ${detail}`);
        continue;
      }

      const data = await orRes.json();
      text = data.choices?.[0]?.message?.content;
      if (text) break;
      failures.push(`${model}: no response from model`);
    }

    if (!text) {
      return Response.json(
        { error: `OpenRouter failed for all models: ${failures.join(" | ")}` },
        { status: 502 }
      );
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
