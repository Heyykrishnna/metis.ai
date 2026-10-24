"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./icon";

export function Dialog({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!returnFocus.current && document.activeElement instanceof HTMLElement)
      returnFocus.current = document.activeElement;
    if (element && !element.open) element.showModal();
    element?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      queueMicrotask(() => {
        if (!element?.isConnected && returnFocus.current?.isConnected)
          returnFocus.current.focus();
      });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`dialog ${wide ? "dialog-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}
