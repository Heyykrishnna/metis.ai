import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const poppins = localFont({
  src: [
    { path: "./fonts/poppins-regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/poppins-medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/poppins-semibold.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: "metis.ai",
  description: "Evidence-grounded analytics for unfamiliar databases.",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
