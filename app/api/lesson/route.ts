import { LESSON_SYSTEM_PROMPT, buildLessonUserPrompt, type Lesson } from "@/lib/prompt";

// OpenRouter is OpenAI-compatible, so a plain fetch call is enough —
// no SDK dependency needed for one endpoint. Model is swappable via env var.
const USE_FREE_MODELS = process.env.OPENROUTER_USE_FREE !== "false";
const OPENROUTER_MODEL = USE_FREE_MODELS ? undefined : process.env.OPENROUTER_MODEL;
const FREE_MODELS = (
  process.env.OPENROUTER_FREE_MODELS ??
  "qwen/qwen3-next-80b-a3b-instruct:free,liquid/lfm-2.5-2.6b:free,dots-studio/dots-3-note-preview:free"
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

    const attempts = await Promise.all(REQUEST_MODELS.map(async (model) => {
      let failure = "";
      try {
        const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          // Parallel attempts share one timeout window and fit Vercel's 60s limit.
          signal: AbortSignal.timeout(15_000),
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
        if (!orRes.ok) {
          const errBody = await orRes.text();
          let detail = errBody;
          try {
            detail = JSON.parse(errBody)?.error?.message ?? errBody;
          } catch {
            // Keep non-JSON provider errors readable.
          }
          return { model, lesson: undefined, failure: detail };
        }

        const text: unknown = (await orRes.json()).choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
          return { model, lesson: undefined, failure: "no text response" };
        }
        try {
          return {
            model,
            lesson: JSON.parse(text.trim().replace(/^```json\s*|```$/g, "")) as Lesson,
            failure: "",
          };
        } catch {
          return { model, lesson: undefined, failure: "invalid JSON response" };
        }
      } catch (err: any) {
        failure = err?.message ?? "request timed out";
      }
      return { model, lesson: undefined, failure };
    }));

    const lesson = attempts.find((attempt) => attempt.lesson)?.lesson;
    const failures = attempts
      .filter((attempt) => attempt.failure)
      .map((attempt) => `${attempt.model}: ${attempt.failure}`);

    if (!lesson) {
      return Response.json(
        { error: `OpenRouter failed for all models: ${failures.join(" | ")}` },
        { status: 502 }
      );
    }

    return Response.json({ lesson, filename });
  } catch (err: any) {
    return Response.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
