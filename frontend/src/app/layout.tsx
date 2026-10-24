import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "metis.ai",
  description: "Evidence-grounded analytics for unfamiliar databases.",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
