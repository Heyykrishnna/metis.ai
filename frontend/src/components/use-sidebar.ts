"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const mobileQuery = "(max-width: 760px)";

function subscribeToViewport(listener: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function mobileSnapshot() {
  return window.matchMedia(mobileQuery).matches;
}

function serverSnapshot() {
  return false;
}

export function useSidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    mobileSnapshot,
    serverSnapshot,
  );
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const desktopToggleRef = useRef<HTMLButtonElement>(null);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const toggle = sidebarToggleRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebar
      .querySelector<HTMLButtonElement>("button")
      ?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]"))
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeSidebar();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (window.matchMedia(mobileQuery).matches)
        toggle?.focus({ preventScroll: true });
    };
  }, [isMobile, sidebarOpen, closeSidebar]);

  return {
    sidebarOpen,
    sidebarExpanded,
    isMobile,
    sidebarRef,
    sidebarToggleRef,
    desktopToggleRef,
    closeSidebar,
    openSidebar: () => setSidebarOpen(true),
    toggleSidebar: () => setSidebarExpanded((expanded) => !expanded),
    collapseSidebar: () => {
      setSidebarExpanded(false);
      desktopToggleRef.current?.focus({ preventScroll: true });
    },
  };
}
