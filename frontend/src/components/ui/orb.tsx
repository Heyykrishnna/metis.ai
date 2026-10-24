"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "motion/react";
import type { OrbState } from "thinking-orbs";
import "./orb.css";

const ThinkingOrb = dynamic(
  () => import("thinking-orbs").then((module) => module.ThinkingOrb),
  { ssr: false, loading: () => <span className="orb-placeholder" /> },
);

export function Orb({
  state = "searching",
  size = 64,
}: {
  state?: OrbState;
  size?: 20 | 64;
}) {
  const reduced = useReducedMotion();
  return (
    <span
      className="orb"
      data-slot="orb"
      data-state={state}
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <ThinkingOrb
        state={state}
        size={size}
        theme="light"
        color="#687f72"
        speed={0.8}
        paused={Boolean(reduced)}
      />
    </span>
  );
}
