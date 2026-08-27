"use client";

import { useState, useCallback } from "react";
import { isLesson, type Lesson } from "@/lib/prompt";
import { lessonToMarkdown } from "@/lib/markdown";
import QuizBlock from "@/components/QuizBlock";

export default function Home() {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setLesson(null);
    setLoading(true);
    try {
      const code = await file.text();
      const res = await fetch("/api/lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (!isLesson(data.lesson)) throw new Error("The model returned an incomplete lesson.");
      setLesson(data.lesson);
      setFilename(data.filename);
    } catch (e: any) {
      setError(e.message ?? "Failed to generate lesson.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const downloadMd = () => {
    if (!lesson || !filename) return;
    const md = lessonToMarkdown(filename, lesson);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename.replace(/\.[^.]+$/, "")}-lesson.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main>
      <h1>Learn From Code</h1>
      <p>Drop a code file. Get a lesson built from it — not a generic tutorial.</p>

      <div
        className={`dropzone${dragActive ? " active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById("fileInput")?.click()}
      >
        {loading ? "Generating lesson…" : "Drag a code file here, or click to choose one"}
        <input
          id="fileInput"
          type="file"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      {error && <p className="error">{error}</p>}

      {lesson && (
        <section style={{ marginTop: 40 }}>
          <h2>{filename}</h2>
          <p><em>{lesson.language}</em></p>
          <p>{lesson.fileSummary}</p>

          <h3>Key Concepts</h3>
          {lesson.concepts.map((c, i) => (
            <div className="concept" key={i}>
              <h3 style={{ marginTop: 0 }}>{c.title}</h3>
              <p>{c.explanation}</p>
              <pre><code>{c.codeRef}</code></pre>
            </div>
          ))}

          <h3>Walkthrough</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{lesson.walkthrough}</p>

          <h3>Quiz</h3>
          {lesson.quiz.map((q, i) => (
            <QuizBlock key={i} q={q} index={i} />
          ))}

          <button onClick={downloadMd} style={{ marginTop: 20 }}>Download as .md</button>
        </section>
      )}
    </main>
  );
}
