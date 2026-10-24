"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  MAX_FILES,
  MAX_FILE_SIZE,
  type LocalDocument,
} from "@/lib/local-files";
import {
  uploadFile,
  loadFiles,
  deleteFile,
  analyzeFile,
  fileHistory,
  originalFileUrl,
} from "@/lib/file-client";
import { downloadText, type Question } from "@/lib/workspace";
import {
  getConnections,
  getSchemaConstellation,
  submitAnalysis,
  getRun,
  getRunResult,
  getRunEvidence,
  getTruthLedger,
  getDirtyRadar,
  reviewRadarAnomaly,
  getCounterfactuals,
  getQueryCostPassport,
  getRecipes,
  executeRecipe,
  submitFeedback,
  getExportUrl,
  type Connection,
  type SchemaConstellation,
  type Recipe,
  type Result,
} from "@/lib/api-client";
import { Dialog } from "./dialog";
import {
  FileDialog,
  ConnectionDialog,
  SearchDialog,
  ActivityDialog,
} from "./workspace-dialogs";
import { Icon } from "./icon";
import { navigation, type View, type Modal } from "./workspace-navigation";
import { HomeView } from "./home-view";
import { SettingsView } from "./settings-view";
import { HelpView } from "./help-view";
import { ClarificationPanel } from "./clarification-panel";
import { FileAnswer, FileEvidence, FileSchema } from "./file-answer";
import { CodeBlock } from "./ui/code-block";
import { FileDropzone } from "./ui/file-dropzone";
import { useQuestions } from "./use-questions";
import {
  DocumentPreview,
  EmptyState,
  FileList,
  LedgerView,
  QuestionList,
  SchemaView,
  TemplatesView,
  ResultsTable,
  DirtyRadarView,
  CounterfactualView,
  PassportView,
  RecipesView,
} from "./workspace-views";

const descriptions: Record<View, string> = {
  Home: "A clearer way to understand your data.",
  "All analyses":
    "A home for your questions, from first thought to final answer.",
  "Saved questions": "Good questions deserve a place to come back to.",
  Templates: "A thoughtful starting point for your next discovery.",
  "Data sources": "Bring your data together. Keep control of where it goes.",
  "Schema explorer": "Get familiar with the structure behind your data.",
  "Truth Ledger":
    "Follow the evidence. Understand what has actually been checked.",
  Settings: "Make this little corner of Metis your own.",
  "Help & getting started":
    "From an unfamiliar dataset to a more useful question.",
};

export function Workspace() {
  const [view, setView] = useState<View>("Home");
  const [modal, setModal] = useState<Modal>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overview, setOverview] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("Ask your data");
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<LocalDocument | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionTab, setQuestionTab] = useState("Overview");
  const [reading, setReading] = useState(false);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Personal workspace");
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [statusVersion, setStatusVersion] = useState(0);
  const [inferenceAvailable, setInferenceAvailable] = useState(false);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null,
  );
  const [constellation, setConstellation] =
    useState<SchemaConstellation | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [savedTab, setSavedTab] = useState<"questions" | "recipes">(
    "questions",
  );
  const [executingRecipeId, setExecutingRecipeId] = useState<string | null>(
    null,
  );
  const [clarificationText, setClarificationText] = useState("");
  const [submittingClarification, setSubmittingClarification] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const { questions, updateQuestions } = useQuestions();
  const readingRef = useRef(false);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const selectedDocument = documents.find(
    (document) => document.id === selectedId,
  );
  const source = selectedDocument
    ? selectedDocument.name
    : activeConnection
      ? `${activeConnection.name} (PostgreSQL)`
      : "Choose a source";

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/status", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json();
        const online =
          response.ok &&
          typeof body === "object" &&
          body !== null &&
          "status" in body &&
          body.status === "online";
        setApiStatus(online ? "online" : "offline");
        setInferenceAvailable(
          online &&
            typeof body === "object" &&
            body !== null &&
            "inferenceAvailable" in body &&
            body.inferenceAvailable === true,
        );
        if (online) {
          Promise.all([loadFiles(), fileHistory()])
            .then(([files, history]) => {
              if (controller.signal.aborted) return;
              setDocuments(files);
              setSelectedId((current) =>
                files.some((file) => file.id === current)
                  ? current
                  : (files[0]?.id ?? ""),
              );
              updateQuestions((current) => {
                const fromServer = history.map((analysis): Question => {
                  const previous = current.find(
                    (item) => item.runId === analysis.id,
                  );
                  return {
                    id: previous?.id ?? analysis.id,
                    text: analysis.question,
                    mode: previous?.mode ?? "Ask your data",
                    source:
                      files.find((file) => file.id === analysis.fileId)?.name ??
                      "Stored file",
                    fileId: analysis.fileId,
                    runId: analysis.id,
                    status: analysis.result.answer.status,
                    result: analysis.result,
                    fileAnalysis: analysis,
                    createdAt: Date.parse(analysis.createdAt),
                    saved: previous?.saved ?? false,
                  };
                });
                const other = current.filter(
                  (item) =>
                    !history.some((analysis) => analysis.id === item.runId) &&
                    (!item.fileId ||
                      files.some((file) => file.id === item.fileId)),
                );
                return [...fromServer, ...other].sort(
                  (left, right) => right.createdAt - left.createdAt,
                );
              });
            })
            .catch((error: unknown) => {
              if (!controller.signal.aborted)
                setNotice(
                  error instanceof Error
                    ? error.message
                    : "Stored files could not be loaded.",
                );
            });
          getConnections()
            .then((list) => {
              setConnections(list);
              if (list.length > 0) {
                setActiveConnectionId(
                  (current) => current ?? list[0]?.id ?? null,
                );
              }
            })
            .catch(() => void 0);

          getRecipes()
            .then(setRecipes)
            .catch(() => void 0);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiStatus("offline");
      });
    return () => controller.abort();
  }, [statusVersion, updateQuestions]);

  useEffect(() => {
    if (activeConnectionId && apiStatus === "online") {
      getSchemaConstellation(activeConnectionId)
        .then(setConstellation)
        .catch(() => setConstellation(null));
    }
  }, [activeConnectionId, apiStatus]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setModal((current) => (current === "search" ? null : "search"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  function navigate(next: View) {
    setView(next);
    setSidebarOpen(false);
    setQuestion(null);
    setFilter("");
  }

  function applyTemplate(text: string, category: string) {
    navigate("Home");
    setOverview(false);
    setPrompt(text);
    setMode(
      category === "Verify"
        ? "Verify a claim"
        : category === "Explore"
          ? "Explore schema"
          : "Ask your data",
    );
    requestAnimationFrame(() =>
      document.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
    );
  }

  async function pollRunUntilTerminal(questionId: string, runId: string) {
    const terminalStatuses = new Set([
      "answered",
      "completed",
      "needs_clarification",
      "abstained",
      "blocked_by_policy",
      "execution_failed",
      "timed_out",
      "cancelled",
    ]);

    let activeRun = await getRun(runId);
    const deadline = Date.now() + 120000;
    while (!terminalStatuses.has(activeRun.status)) {
      if (Date.now() >= deadline)
        throw new Error(
          "Status checking timed out. Reopen this question to check its final outcome.",
        );
      await new Promise((resolve) => setTimeout(resolve, 800));
      activeRun = await getRun(runId);
      updateQuestions((current) =>
        current.map((q) =>
          q.id === questionId ? { ...q, status: activeRun.status } : q,
        ),
      );
      setQuestion((curr) =>
        curr?.id === questionId ? { ...curr, status: activeRun.status } : curr,
      );
    }

    if (activeRun.status !== "answered") {
      const result = await getRunResult(runId);
      const fields = { status: activeRun.status, result };
      updateQuestions((current) =>
        current.map((item) =>
          item.id === questionId ? { ...item, ...fields } : item,
        ),
      );
      setQuestion((current) =>
        current?.id === questionId ? { ...current, ...fields } : current,
      );
    }
    if (activeRun.status === "answered") {
      const [resResult, resEvidence, resLedger, resRadar, resCf, resPassport] =
        await Promise.allSettled([
          getRunResult(runId),
          getRunEvidence(runId),
          getTruthLedger(runId),
          getDirtyRadar(runId),
          getCounterfactuals(runId),
          getQueryCostPassport(runId),
        ]);

      const updatedFields = {
        status: activeRun.status,
        result: resResult.status === "fulfilled" ? resResult.value : undefined,
        evidence:
          resEvidence.status === "fulfilled" ? resEvidence.value : undefined,
        ledger: resLedger.status === "fulfilled" ? resLedger.value : undefined,
        radar: resRadar.status === "fulfilled" ? resRadar.value : undefined,
        counterfactuals: resCf.status === "fulfilled" ? resCf.value : undefined,
        passport:
          resPassport.status === "fulfilled" ? resPassport.value : undefined,
      };

      updateQuestions((current) =>
        current.map((q) =>
          q.id === questionId ? { ...q, ...updatedFields } : q,
        ),
      );
      setQuestion((curr) =>
        curr?.id === questionId ? { ...curr, ...updatedFields } : curr,
      );
      setNotice("Analysis verified and completed.");
    } else if (activeRun.status === "needs_clarification") {
      setNotice("The orchestrator requires clarification to proceed.");
    } else if (activeRun.status === "blocked_by_policy") {
      setNotice("Analysis blocked by database security policy.");
    }
  }

  async function executeAnalysisRequest(
    questionId: string,
    userPrompt: string,
    connId: string,
    parentRunId?: string,
  ) {
    try {
      const run = await submitAnalysis({
        connectionId: connId,
        question: userPrompt,
        parentRunId,
      });

      updateQuestions((current) =>
        current.map((q) =>
          q.id === questionId
            ? { ...q, runId: run.runId, status: run.status }
            : q,
        ),
      );
      setQuestion((curr) =>
        curr?.id === questionId
          ? { ...curr, runId: run.runId, status: run.status }
          : curr,
      );

      await pollRunUntilTerminal(questionId, run.runId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Analysis request failed.";
      updateQuestions((current) =>
        current.map((q) =>
          q.id === questionId ? { ...q, status: "execution_failed" } : q,
        ),
      );
      setQuestion((curr) =>
        curr?.id === questionId
          ? { ...curr, status: "execution_failed" }
          : curr,
      );
      setNotice(message);
    }
  }

  async function executeFileQuestion(id: string, fileId: string, text: string) {
    try {
      const analysis = await analyzeFile(fileId, text);
      const fields = {
        text,
        status: analysis.result.answer.status,
        runId: analysis.id,
        result: analysis.result,
        fileAnalysis: analysis,
      };
      updateQuestions((current) =>
        current.map((item) => (item.id === id ? { ...item, ...fields } : item)),
      );
      setQuestion((current) =>
        current?.id === id ? { ...current, ...fields } : current,
      );
      return true;
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "The file question could not be completed.";
      setNotice(reason);
      const result: Result = {
        answer: {
          runId: id,
          status: "execution_failed",
          reason,
          nextAction: "Check service readiness and submit the question again.",
          assumptions: [],
          limitations: [],
        },
        columns: [],
        rows: [],
      };
      const fields = {
        status: "execution_failed",
        result,
        fileAnalysis: undefined,
      };
      updateQuestions((current) =>
        current.map((item) => (item.id === id ? { ...item, ...fields } : item)),
      );
      setQuestion((current) =>
        current?.id === id ? { ...current, ...fields } : current,
      );
      return false;
    }
  }

  function submitQuestion() {
    if (!prompt.trim()) return;
    const userText = prompt.trim();
    const canAnalyze =
      apiStatus === "online" && activeConnectionId && !selectedDocument;

    const draft: Question = {
      id: crypto.randomUUID(),
      text: userText,
      mode,
      source,
      createdAt: Date.now(),
      saved: false,
      status: canAnalyze || selectedDocument ? "planning" : undefined,
      fileId: selectedDocument?.id,
      connectionId: canAnalyze ? activeConnectionId : undefined,
    };

    const stored = updateQuestions((current) => [draft, ...current]);
    if (!stored)
      setNotice(
        "Browser storage is unavailable. This question will only stay open in this session.",
      );

    setQuestion(draft);
    setQuestionTab("Overview");
    setView("All analyses");
    setPrompt("");
    setFeedbackRating(null);
    setFeedbackSubmitted(false);

    if (selectedDocument) {
      void executeFileQuestion(draft.id, selectedDocument.id, userText);
    } else if (canAnalyze && activeConnectionId) {
      void executeAnalysisRequest(draft.id, userText, activeConnectionId);
    }
  }

  async function handleClarification() {
    if (!clarificationText.trim() || !question || submittingClarification)
      return;
    const input = clarificationText.trim();
    const combined = `${question.text}\nClarification: ${input}`;
    if (question.fileId && combined.length > 4000) {
      setNotice(
        "Shorten the clarification so the full question stays under 4,000 characters.",
      );
      return;
    }
    setSubmittingClarification(true);
    try {
      if (question.fileId) {
        if (await executeFileQuestion(question.id, question.fileId, combined))
          setClarificationText("");
      } else {
        const connId = question.connectionId ?? activeConnectionId;
        if (!connId) {
          setNotice("Choose a source before continuing.");
          return;
        }
        await executeAnalysisRequest(
          question.id,
          input,
          connId,
          question.runId,
        );
        setClarificationText("");
      }
    } finally {
      setSubmittingClarification(false);
    }
  }

  async function handleExecuteRecipe(r: Recipe) {
    setExecutingRecipeId(r.id);
    try {
      const res = await executeRecipe(r.id);
      const draft: Question = {
        id: crypto.randomUUID(),
        text: r.question,
        mode: "Ask your data",
        source: r.name,
        createdAt: Date.now(),
        saved: true,
        status: res.status,
        runId: res.runId,
        connectionId: r.connectionId,
      };
      updateQuestions((current) => [draft, ...current]);
      setQuestion(draft);
      setQuestionTab("Overview");
      setView("All analyses");
      await pollRunUntilTerminal(draft.id, res.runId);
    } catch (err) {
      setNotice(
        err instanceof Error ? err.message : "Failed to execute recipe.",
      );
    } finally {
      setExecutingRecipeId(null);
    }
  }

  async function handleFeedback(rating: number) {
    if (!question?.runId) return;
    setFeedbackRating(rating);
    try {
      await submitFeedback({
        runId: question.runId,
        rating,
        category: "correctness",
        comment: "Analyst verified feedback from workspace",
      });
      setFeedbackSubmitted(true);
      setNotice("Feedback submitted.");
    } catch {
      setNotice("Could not submit feedback.");
    }
  }

  async function handleReviewAnomaly(
    anomalyId: string,
    state: "accepted" | "rejected",
  ) {
    if (!question?.runId || !question.radar) return;
    try {
      await reviewRadarAnomaly(question.runId, anomalyId, state);
      const updatedAnomalies = question.radar.anomalies.map((a) =>
        a.id === anomalyId ? { ...a, reviewState: state } : a,
      );
      const updatedRadar = { ...question.radar, anomalies: updatedAnomalies };
      setQuestion((curr) => (curr ? { ...curr, radar: updatedRadar } : curr));
      updateQuestions((current) =>
        current.map((q) =>
          q.id === question.id ? { ...q, radar: updatedRadar } : q,
        ),
      );
      setNotice(`Anomaly marked as ${state}.`);
    } catch {
      setNotice("Could not record anomaly review.");
    }
  }

  function removeQuestion(id: string) {
    if (
      updateQuestions((current) => current.filter((item) => item.id !== id))
    ) {
      setQuestion((current) => (current?.id === id ? null : current));
      setNotice("Question removed from this browser.");
    } else
      setNotice(
        "Could not remove this question. Check browser storage permissions.",
      );
  }

  function toggleSaved(id: string) {
    const stored = updateQuestions((current) =>
      current.map((item) =>
        item.id === id ? { ...item, saved: !item.saved } : item,
      ),
    );
    if (!stored)
      setNotice(
        "Could not save your question. Check browser storage permissions.",
      );
    else
      setQuestion((current) =>
        current?.id === id ? { ...current, saved: !current.saved } : current,
      );
  }

  async function addFiles(files: File[]) {
    if (readingRef.current || !files.length) return;
    readingRef.current = true;
    setReading(true);
    const errors: string[] = [];
    const added: LocalDocument[] = [];
    for (const file of files) {
      if (documents.length + added.length >= MAX_FILES) {
        errors.push(
          "Your workspace can store 10 files. Remove a file before adding another.",
        );
        break;
      }
      if (
        documents.some(
          (item) => item.name === file.name && item.size === file.size,
        ) ||
        added.some((item) => item.name === file.name && item.size === file.size)
      ) {
        errors.push(`${file.name} is already in your workspace.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: the maximum file size is 5 MB.`);
        continue;
      }
      try {
        added.push(await uploadFile(file));
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : `Could not read ${file.name}. Try a UTF-8 file.`,
        );
      }
    }
    setDocuments((current) => [...current, ...added]);
    if (!selectedId && added[0]) setSelectedId(added[0].id);
    setFileErrors(errors);
    setReading(false);
    readingRef.current = false;
    if (added.length)
      setNotice(
        `${added.length} ${added.length === 1 ? "file is" : "files are"} compressed with Brotli and saved in Neon.`,
      );
  }

  async function removeFile(id: string) {
    try {
      await deleteFile(id);
      setDocuments((current) =>
        current.filter((document) => document.id !== id),
      );
      updateQuestions((current) =>
        current.filter((item) => item.fileId !== id),
      );
      if (selectedId === id) setSelectedId("");
      setNotice(
        "Stored file and its analysis records removed. Your original file is unchanged.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The file could not be removed.",
      );
    }
  }

  function openQuestion(item: Question) {
    setQuestion(item);
    setQuestionTab("Overview");
    setView("All analyses");
    setModal(null);
    if (item.runId && !item.fileId && !item.result)
      void pollRunUntilTerminal(item.id, item.runId).catch(() =>
        setNotice(
          "The saved result could not be restored. Check the service status and retry.",
        ),
      );
  }

  const matchingQuestions = questions.filter(
    (item) =>
      (view !== "Saved questions" || item.saved) &&
      item.text.toLowerCase().includes(filter.toLowerCase()),
  );
  const filteredDocuments = documents.filter((item) =>
    item.name.toLowerCase().includes(filter.toLowerCase()),
  );

  const questionDocument = documents.find(
    (item) => item.id === question?.fileId,
  );

  function askFileSchema() {
    if (!question?.fileId) return;
    const draft: Question = {
      id: crypto.randomUUID(),
      text: "Show me the schema of this file",
      mode: "Explore schema",
      source: question.source,
      fileId: question.fileId,
      createdAt: Date.now(),
      saved: false,
      status: "planning",
    };
    updateQuestions((current) => [draft, ...current]);
    setQuestion(draft);
    setQuestionTab("Overview");
    void executeFileQuestion(draft.id, question.fileId, draft.text);
  }

  const availableTabs = question?.fileId
    ? ["Overview", "Results", "Schema", "Evidence"]
    : [
        "Overview",
        "SQL",
        "Results",
        "Truth Ledger",
        "Dirty Radar",
        "Counterfactuals",
        "Cost Passport",
      ];

  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`sidebar ${sidebarOpen ? "is-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <div className="brand-row">
          <button
            className="brand"
            aria-label="Metis home"
            onClick={() => navigate("Home")}
          >
            <span className="brand-mark" aria-hidden="true">
              m
            </span>
            <span>
              metis<span className="brand-ai">.ai</span>
            </span>
          </button>
          <button
            className="icon-button sidebar-collapse"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="panel" size={18} />
          </button>
        </div>
        <button className="sidebar-search" onClick={() => setModal("search")}>
          <Icon name="search" size={17} />
          <span>Search anything…</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav>
          {navigation.map((item) => (
            <div key={item.label}>
              {item.group && <p className="nav-section">{item.group}</p>}
              <button
                aria-current={view === item.label ? "page" : undefined}
                className={`nav-item ${view === item.label ? "active" : ""}`}
                onClick={() => navigate(item.label)}
              >
                <Icon name={item.icon} size={16} />
                <span>{item.label}</span>
                {item.label === "Saved questions" &&
                  questions.some((item) => item.saved) && (
                    <span className="nav-count">
                      {questions.filter((item) => item.saved).length}
                    </span>
                  )}
                {item.label === "Data sources" &&
                  (connections.length > 0 || documents.length > 0) && (
                    <span className="nav-count">
                      {connections.length + documents.length}
                    </span>
                  )}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${view === "Help & getting started" ? "active" : ""}`}
            onClick={() => navigate("Help & getting started")}
          >
            <Icon name="help" size={18} />
            Help & getting started
            <Icon name="arrow" size={14} />
          </button>
          <button
            className={`nav-item ${view === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Icon name="settings" size={18} />
            Settings
          </button>
          <button
            className="workspace-profile"
            onClick={() => navigate("Settings")}
          >
            <span className="avatar">Y</span>
            <span>
              <strong>{workspaceName}</strong>
              <small>
                {apiStatus === "online" ? "Connected workspace" : "Offline"}
              </small>
            </span>
            <Icon name="down" size={15} />
          </button>
          <div className="sidebar-legal-links">
            <Link href="/privacy">Privacy Policy</Link>
            <span>·</span>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span>{view === "Home" ? "Home" : view}</span>
          </div>
          <div className="topbar-actions">
            <span className="private-badge">
              <Icon name="shield" size={13} /> Private workspace
            </span>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="Workspace activity"
              onClick={() => setModal("activity")}
            >
              <Icon name="bell" size={18} />
              <span className="notification-dot" />
            </button>
            <button
              className="topbar-avatar"
              aria-label="Workspace settings"
              onClick={() => navigate("Settings")}
            >
              Y
            </button>
          </div>
        </header>
        <main
          id="main-content"
          className={
            view === "Home" ? "main-content home-content" : "main-content"
          }
        >
          {view === "Home" ? (
            <HomeView
              overview={overview}
              setOverview={setOverview}
              documents={documents}
              questions={questions}
              prompt={prompt}
              setPrompt={setPrompt}
              mode={mode}
              setMode={setMode}
              source={source}
              submitQuestion={submitQuestion}
              navigate={navigate}
              applyTemplate={applyTemplate}
              onUpload={() => {
                setFileErrors([]);
                setModal("files");
              }}
              openQuestion={openQuestion}
              toggleSaved={toggleSaved}
              removeQuestion={removeQuestion}
              setPreview={setPreview}
              removeFile={removeFile}
            />
          ) : (
            <div className="page-body">
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    {view === "Truth Ledger"
                      ? "EVIDENCE OVER ASSUMPTIONS"
                      : "YOUR METIS WORKSPACE"}
                  </span>
                  <h1>{view}</h1>
                  <p>{descriptions[view]}</p>
                </div>
                {view === "Data sources" ? (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="button"
                      onClick={() => setModal("connection")}
                    >
                      <Icon name="link" size={16} />
                      Manage connections
                    </button>
                    <button
                      className="button button-dark"
                      onClick={() => setModal("files")}
                    >
                      <Icon name="plus" size={16} />
                      Add file
                    </button>
                  </div>
                ) : (
                  (view === "All analyses" || view === "Saved questions") && (
                    <button
                      className="button button-dark"
                      onClick={() => {
                        navigate("Home");
                        setOverview(false);
                      }}
                    >
                      <Icon name="plus" size={16} />
                      New question
                    </button>
                  )
                )}
              </div>
              {(view === "All analyses" || view === "Saved questions") &&
                (question ? (
                  <section className="analysis-detail">
                    <button
                      className="text-button"
                      onClick={() => setQuestion(null)}
                    >
                      ← Back to questions
                    </button>
                    <div className="analysis-title">
                      <h2>{question.text.split("\nClarification:")[0]}</h2>
                      <button
                        className={`icon-button ${question.saved ? "bookmarked" : ""}`}
                        aria-label={
                          question.saved ? "Unsave question" : "Save question"
                        }
                        onClick={() => toggleSaved(question.id)}
                      >
                        <Icon name="bookmark" />
                      </button>
                    </div>
                    <div className="document-meta">
                      <span
                        className={`status-chip ${question.status === "answered" || question.status === "completed" ? "blue" : question.status === "needs_clarification" ? "amber" : "lavender"}`}
                      >
                        {question.status
                          ? question.status.replace(/_/g, " ")
                          : "Draft · Not executed"}
                      </span>
                      <span>{question.mode}</span>
                      <span>{question.source}</span>
                    </div>

                    <div className="filter-tabs">
                      {availableTabs.map((tab) => (
                        <button
                          key={tab}
                          className={questionTab === tab ? "active" : ""}
                          aria-pressed={questionTab === tab}
                          onClick={() => setQuestionTab(tab)}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>

                    {questionTab === "Overview" && (
                      <div>
                        {question.status === "needs_clarification" && (
                          <ClarificationPanel
                            question={question}
                            document={questionDocument}
                            value={clarificationText}
                            onChange={setClarificationText}
                            onSubmit={() => void handleClarification()}
                            busy={submittingClarification}
                          />
                        )}
                        {question.fileAnalysis ? (
                          <FileAnswer
                            analysis={question.fileAnalysis}
                            document={questionDocument}
                            onEvidence={() => setQuestionTab("Evidence")}
                            onResults={() => setQuestionTab("Results")}
                            onSchema={() => setQuestionTab("Schema")}
                          />
                        ) : question.status ===
                          "needs_clarification" ? null : question.result
                            ?.answer ? (
                          <div
                            className="claim-card"
                            style={{ margin: "16px 0", padding: 20 }}
                          >
                            <span className="eyebrow">
                              {question.result.answer.status !== "answered"
                                ? "ANALYSIS STATUS"
                                : question.fileAnalysis
                                  ? "FILE-GROUNDED RESULT"
                                  : "VERIFIED ANSWER"}
                            </span>
                            <p
                              style={{
                                font: "18px/1.6 Georgia, serif",
                                color: "#343942",
                                margin: "10px 0",
                              }}
                            >
                              {question.result.answer.status === "answered"
                                ? question.result.answer.answerText
                                : question.result.answer.reason}
                            </p>
                          </div>
                        ) : (
                          <EmptyState
                            icon="sparkles"
                            title={
                              question.status === "planning" ||
                              question.status === "executing"
                                ? "Analysis in progress…"
                                : "Draft analysis question"
                            }
                          >
                            {question.status === "planning" ||
                            question.status === "executing"
                              ? question.fileId
                                ? "Metis is reading the stored file and planning a validated calculation. Values are computed from the complete file."
                                : "Metis is inspecting the schema, planning a read-only query, and gathering evidence."
                              : "This question has not executed against an active database connection. Select an active connection and submit to generate verified results."}
                          </EmptyState>
                        )}

                        {question.runId && !question.fileId && (
                          <div className="feedback-container">
                            <span style={{ fontSize: 12, color: "#515762" }}>
                              Rate analysis accuracy:
                            </span>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                className={`button ${feedbackRating === 5 ? "button-dark" : ""}`}
                                style={{ padding: "4px 8px" }}
                                onClick={() => handleFeedback(5)}
                              >
                                <Icon name="thumbsUp" size={14} />
                              </button>
                              <button
                                className={`button ${feedbackRating === 1 ? "button-dark" : ""}`}
                                style={{ padding: "4px 8px" }}
                                onClick={() => handleFeedback(1)}
                              >
                                <Icon name="thumbsDown" size={14} />
                              </button>
                            </div>
                            {feedbackSubmitted && (
                              <span
                                style={{
                                  fontSize: 11,
                                  color: "#515762",
                                  marginLeft: "auto",
                                }}
                              >
                                Feedback recorded
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {questionTab === "Evidence" && question.fileAnalysis && (
                      <FileEvidence
                        analysis={question.fileAnalysis}
                        document={questionDocument}
                      />
                    )}
                    {questionTab === "Schema" && question.fileId && (
                      <FileSchema
                        document={questionDocument}
                        analysis={question.fileAnalysis}
                        onAnalyze={askFileSchema}
                      />
                    )}
                    {questionTab === "SQL" && (
                      <div>
                        {question.evidence?.finalStatus === "answered" &&
                        question.evidence.candidate.sqlText ? (
                          <CodeBlock
                            code={question.evidence.candidate.sqlText}
                          />
                        ) : (
                          <EmptyState icon="code" title="No SQL generated yet">
                            SQL generation occurs upon execution against an
                            active PostgreSQL connection.
                          </EmptyState>
                        )}
                      </div>
                    )}

                    {questionTab === "Results" && (
                      <div>
                        {question.result ? (
                          <ResultsTable result={question.result} />
                        ) : (
                          <EmptyState
                            icon="chart"
                            title="No query results available"
                          >
                            Tabular results will appear after SQL execution
                            completes.
                          </EmptyState>
                        )}
                      </div>
                    )}

                    {questionTab === "Truth Ledger" && (
                      <div>
                        <LedgerView
                          documents={documents}
                          ledger={question.ledger}
                          onUpload={() => setModal("files")}
                        />
                      </div>
                    )}

                    {questionTab === "Dirty Radar" && (
                      <div>
                        {question.radar ? (
                          <DirtyRadarView
                            radar={question.radar}
                            onReviewAnomaly={handleReviewAnomaly}
                          />
                        ) : (
                          <EmptyState
                            icon="radar"
                            title="Dirty Radar not evaluated"
                          >
                            Run an analysis to scan columns for unexpected null
                            spikes, extreme outliers, and pattern drift.
                          </EmptyState>
                        )}
                      </div>
                    )}

                    {questionTab === "Counterfactuals" && (
                      <div>
                        {question.counterfactuals ? (
                          <CounterfactualView
                            counterfactuals={question.counterfactuals}
                          />
                        ) : (
                          <EmptyState
                            icon="layers"
                            title="Counterfactual comparison unavailable"
                          >
                            Counterfactual variants explore sensitivity across
                            different assumptions and period definitions.
                          </EmptyState>
                        )}
                      </div>
                    )}

                    {questionTab === "Cost Passport" && (
                      <div>
                        {question.passport ? (
                          <PassportView passport={question.passport} />
                        ) : (
                          <EmptyState
                            icon="clock"
                            title="Query Cost Passport not measured"
                          >
                            Query duration, row limits, and model call metrics
                            will be tracked when executed.
                          </EmptyState>
                        )}
                      </div>
                    )}

                    <div className="analysis-actions" style={{ marginTop: 24 }}>
                      <button
                        className="button"
                        onClick={() => {
                          setQuestion(null);
                          if (question.fileId) setSelectedId(question.fileId);
                          applyTemplate(
                            question.text,
                            question.mode === "Verify a claim"
                              ? "Verify"
                              : question.mode === "Explore schema"
                                ? "Explore"
                                : "Discover",
                          );
                        }}
                      >
                        Refine question
                        <Icon name="arrow" size={15} />
                      </button>

                      {question.fileAnalysis ? (
                        <>
                          <a
                            className="button"
                            href={originalFileUrl(question.fileAnalysis.fileId)}
                          >
                            <Icon name="download" size={15} />
                            Download source
                          </a>
                          <button
                            className="button"
                            onClick={() =>
                              downloadText(
                                "metis-file-evidence.json",
                                JSON.stringify(question.fileAnalysis, null, 2),
                              )
                            }
                          >
                            <Icon name="download" size={15} />
                            Export answer & evidence
                          </button>
                        </>
                      ) : question.runId ? (
                        <>
                          <a
                            className="button"
                            href={getExportUrl(question.runId, "csv")}
                            download
                          >
                            <Icon name="download" size={15} />
                            Export CSV
                          </a>
                          <a
                            className="button"
                            href={getExportUrl(question.runId, "sql")}
                            download
                          >
                            <Icon name="download" size={15} />
                            Export SQL
                          </a>
                          <a
                            className="button"
                            href={getExportUrl(
                              question.runId,
                              "reproducibility",
                            )}
                            download
                          >
                            <Icon name="download" size={15} />
                            Reproducibility Bundle
                          </a>
                        </>
                      ) : (
                        <button
                          className="button"
                          onClick={() =>
                            downloadText(
                              "metis-question.txt",
                              `${question.text}\n\nMode: ${question.mode}\nSource: ${question.source}\nStatus: Draft, not executed\n`,
                            )
                          }
                        >
                          <Icon name="download" size={15} />
                          Export question
                        </button>
                      )}
                    </div>
                  </section>
                ) : (
                  <section className="panel">
                    {view === "Saved questions" && (
                      <div className="filter-tabs" style={{ marginBottom: 16 }}>
                        <button
                          className={savedTab === "questions" ? "active" : ""}
                          onClick={() => setSavedTab("questions")}
                        >
                          Bookmarked Questions
                        </button>
                        <button
                          className={savedTab === "recipes" ? "active" : ""}
                          onClick={() => setSavedTab("recipes")}
                        >
                          Analysis Recipes ({recipes.length})
                        </button>
                      </div>
                    )}

                    {view === "Saved questions" && savedTab === "recipes" ? (
                      <RecipesView
                        recipes={recipes}
                        onExecute={handleExecuteRecipe}
                        executingId={executingRecipeId}
                      />
                    ) : (
                      <>
                        <div className="section-heading">
                          <h2>
                            {view === "Saved questions"
                              ? "Your collection"
                              : "Question history"}
                            <span className="count-pill">
                              {matchingQuestions.length}
                            </span>
                          </h2>
                          <label className="inline-search">
                            <Icon name="search" size={16} />
                            <input
                              aria-label="Filter questions"
                              placeholder="Find a question…"
                              value={filter}
                              onChange={(event) =>
                                setFilter(event.target.value)
                              }
                            />
                          </label>
                        </div>
                        {matchingQuestions.length ? (
                          <QuestionList
                            questions={matchingQuestions}
                            onOpen={openQuestion}
                            onSave={toggleSaved}
                            onRemove={removeQuestion}
                          />
                        ) : (
                          <EmptyState
                            icon={
                              view === "Saved questions" ? "bookmark" : "chat"
                            }
                            title={
                              filter
                                ? "No matching questions"
                                : view === "Saved questions"
                                  ? "Keep your best questions close"
                                  : "Curiosity looks good here"
                            }
                          >
                            {filter
                              ? "Try a different word or clear the search."
                              : view === "Saved questions"
                                ? "Use the bookmark next to any question to add it to your collection."
                                : "Ask a question from Home to create your first analysis."}
                          </EmptyState>
                        )}
                      </>
                    )}
                  </section>
                ))}
              {view === "Templates" && <TemplatesView onUse={applyTemplate} />}
              {view === "Data sources" && (
                <>
                  <div className="connection-card">
                    <span className="connection-logo">
                      <Icon name="database" size={27} />
                    </span>
                    <div>
                      <h3>
                        {activeConnection
                          ? `Connected to ${activeConnection.name}`
                          : "Connect the bigger picture."}
                      </h3>
                      <p>
                        {activeConnection
                          ? `PostgreSQL read-only source with ${activeConnection.allowedSchemas.length} authorized schema(s).`
                          : "Configure a read-only PostgreSQL data source or explore local files."}
                      </p>
                    </div>
                    <button
                      className="button"
                      onClick={() => setModal("connection")}
                    >
                      <Icon name="link" size={16} />
                      Database connections ({connections.length})
                    </button>
                  </div>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        Stored files{" "}
                        <span className="count-pill">{documents.length}</span>
                      </h2>
                      <label className="inline-search">
                        <Icon name="search" size={16} />
                        <input
                          aria-label="Filter files"
                          placeholder="Find a file…"
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                        />
                      </label>
                    </div>
                    {documents.length ? (
                      <>
                        {filteredDocuments.length ? (
                          <FileList
                            documents={filteredDocuments}
                            onOpen={setPreview}
                            onRemove={removeFile}
                          />
                        ) : (
                          <EmptyState icon="search" title="No matching files">
                            Try a different filename.
                          </EmptyState>
                        )}
                        <p className="fine-print">
                          Originals are compressed with Brotli in Neon and
                          restored after refresh. Previews show at most 100
                          rows.
                        </p>
                      </>
                    ) : (
                      <FileDropzone onFiles={addFiles} busy={reading} />
                    )}
                    {fileErrors.length > 0 && (
                      <div role="alert" className="error-box">
                        {fileErrors.map((error, index) => (
                          <p key={index}>{error}</p>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}
              {view === "Schema explorer" && (
                <SchemaView
                  documents={documents}
                  constellation={constellation}
                  onUpload={() => setModal("files")}
                  onOpen={setPreview}
                  onRefreshConstellation={() => {
                    if (activeConnectionId) {
                      getSchemaConstellation(activeConnectionId)
                        .then(setConstellation)
                        .catch(() => void 0);
                    }
                  }}
                />
              )}
              {view === "Truth Ledger" && (
                <LedgerView
                  documents={documents}
                  ledger={question?.ledger}
                  onUpload={() => setModal("files")}
                />
              )}
              {view === "Settings" && (
                <SettingsView
                  workspaceName={workspaceName}
                  apiStatus={apiStatus}
                  inferenceAvailable={inferenceAvailable}
                  hasQuestions={questions.length > 0}
                  onRename={(name) => {
                    setWorkspaceName(name);
                    setNotice("Workspace name updated for this session.");
                  }}
                  onCheck={() => {
                    setApiStatus("checking");
                    setStatusVersion((value) => value + 1);
                  }}
                  onClear={() => {
                    if (updateQuestions(() => [])) {
                      setQuestion(null);
                      setNotice("Question history cleared from this browser.");
                    } else setNotice("Could not clear browser storage.");
                  }}
                />
              )}
              {view === "Help & getting started" && (
                <HelpView
                  onUpload={() => setModal("files")}
                  navigate={navigate}
                />
              )}
            </div>
          )}
        </main>
      </div>
      {modal === "files" && (
        <FileDialog
          documents={documents}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setModal(null);
          }}
          addFiles={addFiles}
          reading={reading}
          fileErrors={fileErrors}
          onClose={() => setModal(null)}
          onConnection={() => setModal("connection")}
        />
      )}
      {modal === "connection" && (
        <ConnectionDialog
          connections={connections}
          activeConnectionId={activeConnectionId}
          onSelectConnection={(id) => {
            setActiveConnectionId(id);
            setModal(null);
            setNotice("Active database connection updated.");
          }}
          onConnectionCreated={(conn) => {
            setConnections((curr) => [...curr, conn]);
            setActiveConnectionId(conn.id);
            setNotice(`Connected to ${conn.name}.`);
          }}
          onConnectionRevoked={(id) => {
            setConnections((curr) => curr.filter((c) => c.id !== id));
            if (activeConnectionId === id) setActiveConnectionId(null);
            setNotice("Database connection revoked.");
          }}
          onClose={() => setModal(null)}
          onFiles={() => setModal("files")}
        />
      )}
      {modal === "search" && (
        <SearchDialog
          questions={questions}
          documents={documents}
          navigate={navigate}
          openQuestion={openQuestion}
          onPreview={setPreview}
          applyTemplate={applyTemplate}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "activity" && (
        <ActivityDialog
          apiStatus={apiStatus}
          documents={documents}
          questions={questions}
          activeConnectionName={activeConnection?.name}
          onClose={() => setModal(null)}
        />
      )}
      {preview && (
        <Dialog
          title={preview.name}
          subtitle="A closer look at your original data."
          wide
          onClose={() => setPreview(null)}
        >
          <a className="button" href={originalFileUrl(preview.id)}>
            <Icon name="download" size={16} />
            Download original
          </a>
          <DocumentPreview document={preview} />
        </Dialog>
      )}
      {notice && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
