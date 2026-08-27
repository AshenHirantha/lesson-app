// One prompt, one call, produces language + curated concepts + lesson + quiz.
// ponytail: no multi-call pipeline — the model does all "steps" internally
// in a single structured-output pass. Split into multiple calls only if a
// single call measurably fails to hold quality across large files.

export const LESSON_SYSTEM_PROMPT = `You are a senior software engineer writing a code-reading lesson.

Given a single source code file, produce a lesson that teaches a learner to
READ and UNDERSTAND this exact file — not a generic language tutorial.

Rules:
- Identify the programming language. Do not render a "language primer" —
  use the detected language only as context for terminology/idioms.
- Extract 5 to 10 KEY CONCEPTS: the parts of THIS file that matter most to
  how it actually works (core algorithm, important design decision, tricky
  control flow, the load-bearing function). Rank by importance to the whole
  file, not by novelty or obscurity. Skip trivial getters/boilerplate.
- Ground every explanation in real line references or short code snippets
  from the actual file. Never invent behavior not present in the file.
- Write for someone who can code but has not seen this file before.
- Produce exactly 5 to 8 multiple-choice quiz questions, each tied to one
  of the key concepts, each with exactly 4 options and one correct answer.

Respond with ONLY valid JSON matching this exact shape, no markdown fences,
no preamble, no trailing commentary:

{
  "language": string,
  "fileSummary": string,           // 2-4 sentences, what this file does overall
  "concepts": [
    {
      "title": string,
      "explanation": string,       // why this matters, in plain language
      "codeRef": string            // short quoted snippet or line range from the file
    }
  ],
  "walkthrough": string,           // markdown-formatted narrative tying concepts together in file order
  "quiz": [
    {
      "question": string,
      "options": [string, string, string, string],
      "correctIndex": number,      // 0-3
      "explanation": string        // why the correct answer is correct
    }
  ]
}`;

export function buildLessonUserPrompt(filename: string, code: string): string {
  return `Analyze ${filename}. Return only the requested lesson JSON.

SOURCE:
${code}`;
}

export type LessonConcept = {
  title: string;
  explanation: string;
  codeRef: string;
};

export type LessonQuizQuestion = {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
};

export type Lesson = {
  language: string;
  fileSummary: string;
  concepts: LessonConcept[];
  walkthrough: string;
  quiz: LessonQuizQuestion[];
};
