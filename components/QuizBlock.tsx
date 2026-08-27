"use client";

import { useState } from "react";
import type { LessonQuizQuestion } from "@/lib/prompt";

export default function QuizBlock({ q, index }: { q: LessonQuizQuestion; index: number }) {
  const [picked, setPicked] = useState<number | null>(null);

  return (
    <div className="quiz-q">
      <p><strong>Q{index + 1}.</strong> {q.question}</p>
      {q.options.map((opt, i) => {
        let cls = "option";
        if (picked !== null) {
          if (i === q.correctIndex) cls += " correct";
          else if (i === picked) cls += " wrong";
        }
        return (
          <button key={i} className={cls} onClick={() => setPicked(i)} disabled={picked !== null}>
            {String.fromCharCode(65 + i)}. {opt}
          </button>
        );
      })}
      {picked !== null && <p style={{ opacity: 0.85, marginTop: 8 }}>{q.explanation}</p>}
    </div>
  );
}
