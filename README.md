# Learn From Code — v1

Drop a code file, get a tailored lesson generated from it (overview, curated
key concepts, walkthrough, multiple-choice quiz), downloadable as `.md`.

## Stack

Next.js (App Router) + OpenRouter API (OpenAI-compatible, plain `fetch` —
no SDK dependency). No database, no file storage, no auth — everything
happens in a single request/response cycle. `.md` export is generated
client-side from the JSON response.

Free models are enabled by default. Set `OPENROUTER_USE_FREE=false` to use the
model configured by `OPENROUTER_MODEL` instead.

Free mode uses the explicit `:free` models in `OPENROUTER_FREE_MODELS`, in
priority order. Override that comma-separated list if a model becomes
unavailable.

`OPENROUTER_MAX_TOKENS` optionally controls the response budget and defaults
to `2500`, which fits the low-credit OpenRouter limit shown by the API.

## Local setup

```bash
npm install
cp .env.example .env.local   # add your OPENROUTER_API_KEY
npm run dev
```

Open http://localhost:3000, drop a code file.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel (New Project → select repo).
3. Add `OPENROUTER_API_KEY` in Project Settings → Environment Variables.
   Free mode is the default, and ignores any old `OPENROUTER_MODEL` override.
4. Deploy. No other config needed — `app/api/lesson/route.ts` runs as a
   serverless function automatically.

Note: `maxDuration` is set to 60s in the API route for the Hobby/Pro plan
limit. If lessons on large files time out, either raise this (Pro plan
supports up to 300s) or lower `MAX_CHARS` in the route.

## What's deliberately not here (v1 scope)

- Multi-file / folder input (Phase 02)
- PDF / DOCX export (Phase 02)
- Interactive/video/audio lesson formats (Phase 02)
- Accounts, saved lesson history, database

## File map

```
app/page.tsx              - upload UI + lesson render + .md download
app/api/lesson/route.ts   - single API route: validate → one LLM call → JSON
lib/prompt.ts             - system prompt + JSON schema types
lib/markdown.ts           - lesson JSON -> markdown string
components/QuizBlock.tsx  - single MCQ question component
```
