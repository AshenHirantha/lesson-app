import type { Lesson } from "./prompt";

// ponytail: markdown export is a plain string template, no library.
// PDF/DOCX intentionally deferred to Phase 02.
export function lessonToMarkdown(filename: string, lesson: Lesson): string {
  const concepts = lesson.concepts
    .map((c) => `### ${c.title}\n\n${c.explanation}\n\n\`\`\`\n${c.codeRef}\n\`\`\``)
    .join("\n\n");

  const quiz = lesson.quiz
    .map((q, i) => {
      const opts = q.options
        .map((o, j) => `${String.fromCharCode(65 + j)}. ${o}${j === q.correctIndex ? " ✅" : ""}`)
        .join("\n");
      return `**Q${i + 1}. ${q.question}**\n\n${opts}\n\n_${q.explanation}_`;
    })
    .join("\n\n---\n\n");

  return `# Lesson: ${filename}

**Language:** ${lesson.language}

## Overview

${lesson.fileSummary}

## Key Concepts

${concepts}

## Walkthrough

${lesson.walkthrough}

## Quiz

${quiz}
`;
}
