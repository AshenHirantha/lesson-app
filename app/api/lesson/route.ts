import { LESSON_SYSTEM_PROMPT, buildLessonUserPrompt, type Lesson } from "@/lib/prompt";

// OpenRouter is OpenAI-compatible, so a plain fetch call is enough —
// no SDK dependency needed for one endpoint. Model is swappable via env var.
const CONFIGURED_MODEL = process.env.OPENROUTER_MODEL;
const USE_FREE_MODELS =
  process.env.OPENROUTER_USE_FREE !== "false" || CONFIGURED_MODEL === "openrouter/free";
const OPENROUTER_MODEL = USE_FREE_MODELS ? undefined : CONFIGURED_MODEL;
const DEFAULT_FREE_MODELS = [
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];
const FREE_MODELS = (
  process.env.OPENROUTER_FREE_MODELS ??
  DEFAULT_FREE_MODELS.join(",")
).split(",").map((model) => model.trim()).filter(Boolean).flatMap((model) =>
  model === "openrouter/free" ? DEFAULT_FREE_MODELS : [model]
);
const REQUEST_MODELS = USE_FREE_MODELS ? FREE_MODELS : [OPENROUTER_MODEL ?? ""];
// Keep the reservation below the free balance reported by OpenRouter.
const OPENROUTER_MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS ?? 2500);
const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS ?? 45_000);

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
          // Free providers can be slow; keep this below Vercel's 60s limit.
          signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            // Optional but recommended by OpenRouter for their leaderboards/rate limiting.
            "HTTP-Referer": process.env.SITE_URL ?? "https://localhost:3000",
            "X-OpenRouter-Title": "Learn From Code",
          },
          body: JSON.stringify({
            model,
            max_tokens: OPENROUTER_MAX_TOKENS,
            stream: false,
            response_format: { type: "json_object" },
            plugins: [{ id: "response-healing" }],
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

        const data = await orRes.json();
        const message = data.choices?.[0]?.message;
        const content = message?.content;
        const text = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("")
            : typeof data.choices?.[0]?.text === "string" ? data.choices[0].text : undefined;
        if (typeof text !== "string" || !text.trim()) {
          return {
            model,
            lesson: undefined,
            failure: `no text response (finish_reason: ${data.choices?.[0]?.finish_reason ?? "unknown"})`,
          };
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
