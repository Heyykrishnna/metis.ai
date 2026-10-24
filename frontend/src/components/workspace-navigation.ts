import type { IconName } from "./icon";
export type View =
  | "Home"
  | "All analyses"
  | "Saved questions"
  | "Templates"
  | "Data sources"
  | "Schema explorer"
  | "Truth Ledger"
  | "Settings"
  | "Help & getting started";
export type Modal = "files" | "connection" | "search" | "activity" | null;
export const navigation: { label: View; icon: IconName; group?: string }[] = [
  { label: "Home", icon: "home" },
  { label: "All analyses", icon: "chat", group: "WORKSPACE" },
  { label: "Saved questions", icon: "bookmark" },
  { label: "Templates", icon: "grid" },
  { label: "Data sources", icon: "database", group: "YOUR DATA" },
  { label: "Schema explorer", icon: "layers" },
  { label: "Truth Ledger", icon: "shield" },
];
