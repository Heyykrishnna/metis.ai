import { Icon } from "./icon";
import type { View } from "./workspace-navigation";
export function HelpView({
  onUpload,
  navigate,
}: {
  onUpload: () => void;
  navigate: (view: View) => void;
}) {
  return (
    <div className="help-layout">
      <section className="panel">
        <h2>A clearer path from data to understanding</h2>
        {[
          {
            title: "Bring a little context",
            text: "Add a CSV or JSON file to preview up to 100 rows, inspect fields, and check empty values. TXT and Markdown documents can be read as context.",
            action: "Add your data",
            onClick: onUpload,
          },
          {
            title: "Start with a better question",
            text: "Choose a template, tell Metis what you want to understand, and save the question. You can refine or export it at any time.",
            action: "Explore templates",
            onClick: () => navigate("Templates"),
          },
          {
            title: "Follow the evidence",
            text: "The Truth Ledger shows actual local file checks. SQL, verified answers, relationships, and query execution need the planned backend analysis service.",
            action: "Open Truth Ledger",
            onClick: () => navigate("Truth Ledger"),
          },
        ].map((step, index) => (
          <div className="help-step" key={step.title}>
            <span>{index + 1}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
              <button className="text-button" onClick={step.onClick}>
                {step.action}
                <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        ))}
      </section>
      <section className="panel help-aside">
        <span className="tile-icon lavender">
          <Icon name="chat" size={25} />
        </span>
        <h3>
          Small shortcuts.
          <br />
          More headspace.
        </h3>
        <div>
          <span>Search workspace</span>
          <kbd>⌘ / Ctrl K</kbd>
        </div>
        <div>
          <span>Submit question</span>
          <kbd>Enter</kbd>
        </div>
        <div>
          <span>New line</span>
          <kbd>Shift Enter</kbd>
        </div>
        <div>
          <span>Close dialog</span>
          <kbd>Esc</kbd>
        </div>
      </section>
    </div>
  );
}
