"use client";

import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { analysisActivity } from "@/lib/analysis-activity";
import { workspaceSpring } from "@/lib/motion";
import type { Question } from "@/lib/workspace";
import { Icon } from "../icon";
import { Orb } from "./orb";
import "./thinking-panel.css";

export function ThinkingPanel({ question }: { question: Question }) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const reduced = useReducedMotion();
  const activity = analysisActivity(question);
  if (!activity) return null;
  const busy = activity.state === "thinking";
  const isOpen = expanded ?? activity.state !== "complete";

  return (
    <section
      className="thinking-panel"
      data-slot="thinking-panel"
      data-status={activity.state}
      aria-label="Analysis activity"
    >
      <button
        type="button"
        className="thinking-trigger"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setExpanded(!isOpen)}
      >
        {busy ? (
          <Orb size={20} />
        ) : (
          <span className="thinking-pixels" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => (
              <span
                key={index}
                style={{ animationDelay: `${index * 100}ms` }}
              />
            ))}
          </span>
        )}
        <span>{busy ? "Thinking through your question" : activity.label}</span>
        <span className="thinking-indicator">
          {busy ? "In progress" : "View activity"}
        </span>
        <Icon name="down" size={16} />
      </button>
      <span className="sr-only" role="status">
        {activity.label}
      </span>
      <motion.div
        id={contentId}
        className="thinking-content"
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : workspaceSpring}
        inert={!isOpen}
        aria-hidden={!isOpen}
      >
        <div className="thinking-content-inner">
          <ol className="thinking-steps" aria-label="Activity steps">
            <li>
              <span className="thinking-step-icon">
                <Icon name="database" size={15} />
              </span>
              <div>
                <p>Selected source</p>
                <span className="thinking-source">
                  <Icon
                    name={question.fileId ? "file" : "database"}
                    size={13}
                  />
                  {question.source}
                </span>
              </div>
            </li>
            <li>
              <span className="thinking-step-icon">
                <Icon
                  name={
                    busy
                      ? "clock"
                      : activity.state === "complete"
                        ? "check"
                        : "warning"
                  }
                  size={15}
                />
              </span>
              <div>
                <strong>{activity.label}</strong>
                <p className="thinking-description">{activity.description}</p>
                {activity.resultSummary && (
                  <p className="thinking-result">{activity.resultSummary}</p>
                )}
              </div>
            </li>
            {activity.hasEvidence && (
              <li>
                <span className="thinking-step-icon">
                  <Icon name="shield" size={15} />
                </span>
                <div>
                  <strong>Evidence available</strong>
                  <p className="thinking-description">
                    Inspect the sources, calculations, and checks in the
                    analysis tabs.
                  </p>
                </div>
              </li>
            )}
          </ol>
        </div>
      </motion.div>
    </section>
  );
}
