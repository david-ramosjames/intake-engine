import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intake Engine — Customer Journey Platform",
  description:
    "A configurable, multi-tenant platform to acquire, qualify, and convert customers across any industry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
