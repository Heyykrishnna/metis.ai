"use client";
import { Icon } from "./icon";
export function SettingsView({
  workspaceName,
  apiStatus,
  hasQuestions,
  onRename,
  onCheck,
  onClear,
}: {
  workspaceName: string;
  apiStatus: "checking" | "online" | "offline";
  hasQuestions: boolean;
  onRename: (name: string) => void;
  onCheck: () => void;
  onClear: () => void;
}) {
  return (
    <div className="settings-stack">
      <section className="panel">
        <h2>Workspace details</h2>
        <p className="muted">
          A name that feels like your space. This setting applies to this
          session.
        </p>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const name = String(form.get("name") ?? "").trim();
            if (name) {
              onRename(name);
            }
          }}
        >
          <label htmlFor="workspace-name">Workspace name</label>
          <div className="input-action">
            <input
              id="workspace-name"
              name="name"
              defaultValue={workspaceName}
              required
              maxLength={40}
            />
            <button className="button button-dark">Save changes</button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Service status</h2>
        <div className="setting-row">
          <div>
            <strong>Backend API</strong>
            <p>Health check for the local Metis backend.</p>
          </div>
          <span className={`badge ${apiStatus === "online" ? "mint" : ""}`}>
            {apiStatus === "checking"
              ? "Checking…"
              : apiStatus === "online"
                ? "Online"
                : "Offline"}
          </span>
          <button className="button" onClick={onCheck}>
            Check again
          </button>
        </div>
        <div className="setting-row">
          <div>
            <strong>Analysis & inference</strong>
            <p>
              Qwen2.5-Coder 7B is configured. An analysis API is needed to run
              questions.
            </p>
          </div>
          <span className="badge">Not available</span>
        </div>
      </section>
      <section className="panel">
        <h2>Privacy & local storage</h2>
        <p className="muted">
          Files are read in browser memory and are never sent to a server. Up to
          100 question drafts, including source filenames, are saved in this
          browser. Avoid including secrets in questions.
        </p>
        <button
          className="button danger-button"
          disabled={!hasQuestions}
          onClick={onClear}
        >
          <Icon name="trash" size={16} />
          Clear local question history
        </button>
      </section>
    </div>
  );
}
