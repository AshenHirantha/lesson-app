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
    <div className="app-shell">
      <header className="topbar"><div className="topbar-inner"><span className="brand">CODE_TERMINAL</span><nav className="nav" aria-label="Main navigation"><a href="#upload">LESSONS</a><a href="#walkthrough">DOCS</a><a href="#quiz">FORUM</a><a href="#system">SYSTEM</a></nav><div className="topbar-tools" aria-hidden="true"><span>⌘</span><span>⚙</span></div></div></header>
      <main className="main-content">
        <section className="hero panel" id="upload"><div className="hero-heading"><div><span className="eyebrow">[SYS.INFO]</span><h1>THE_FOCUSED_STUDIO<span className="muted">.exe</span></h1><p className="system-copy">&gt; INITIALIZING SECURE LEARNING ENVIRONMENT...<br />&gt; LOADING DOCUMENT ANALYSIS PROTOCOLS...<br />&gt; READY.</p></div><div className="status"><span>STATUS</span><strong>● ONLINE</strong></div></div>
          <div className={`monitor${dragActive ? " active" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={onDrop} onClick={() => !loading && document.getElementById("fileInput")?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") document.getElementById("fileInput")?.click(); }}><div className="monitor-bar"><span>TERM_MONITOR_v1.0</span><span>{loading ? "PROCESSING..." : "INPUT_AWAITING"}</span></div><div className="monitor-content"><span className="comment"># SYSTEM LOG:</span><span>System ready for document ingestion.<br />Please select source material for parsing and analysis.</span><div className="upload-action"><span className="upload-icon">↑</span><strong>{loading ? "[GENERATING_LESSON]" : "[UPLOAD_SOURCE_FILE]"}</strong><small>Supported: .pdf, .txt, .md, .doc</small></div></div><input id="fileInput" type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} /></div>
        </section>
        <section className="workflow" id="system">{[['01', 'UPLOAD', 'Ingest raw data sources into the system buffer.', '⇧'], ['02', 'ANALYZE', 'System processes and structures semantic nodes.', '◫'], ['03', 'LEARN', 'Engage with synthesized, highly-focused study modules.', '◎']].map(([step, title, copy, icon]) => <article className="step" key={step}><div className="step-top"><span>[STEP_{step}]</span><b>{icon}</b></div><h2>{title}</h2><p>{copy}</p></article>)}</section>
        {error && <p className="error">[ERROR] {error}</p>}
        {lesson && <section className="lesson panel" id="lesson-output"><div className="lesson-heading"><div><span className="eyebrow">[ANALYSIS.COMPLETE]</span><h2>{filename}</h2></div><span className="language">{lesson.language}</span></div><p className="summary">{lesson.fileSummary}</p><div className="section-heading"><span>01 //</span><h3>KEY_CONCEPTS</h3></div><div className="concept-grid">{lesson.concepts.map((c, i) => <article className="concept" key={i}><span className="concept-number">0{i + 1}</span><h3>{c.title}</h3><p>{c.explanation}</p><pre><code>{c.codeRef}</code></pre></article>)}</div><div className="section-heading" id="walkthrough"><span>02 //</span><h3>WALKTHROUGH</h3></div><p className="walkthrough">{lesson.walkthrough}</p><div className="section-heading" id="quiz"><span>03 //</span><h3>KNOWLEDGE_CHECK</h3></div>{lesson.quiz.map((q, i) => <QuizBlock key={i} q={q} index={i} />)}<button className="download" onClick={downloadMd}>↓ DOWNLOAD_AS_MARKDOWN</button></section>}
      </main><footer className="footer"><span>© 2024 TERMINAL_LEARN v1.0.4</span><span>PRIVACY　 LICENSE　 STATUS</span></footer>
    </div>
  );
}
