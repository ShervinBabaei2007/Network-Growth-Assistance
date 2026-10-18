import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { WebVitals } from "@/components/web-vitals";
import { Toaster } from "@/components/toast/toaster";
import { APPEARANCE_SCRIPT } from "@/lib/appearance";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fill the whole screen on phones with notches (the layout keeps clear of them) and tint the browser bar to match.
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Network Growth Assistant",
  description: "Plan, prioritize and track your professional networking and job search.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="system"
      data-density="comfortable"
      data-text="normal"
      // The inline script below sets the saved theme before paint, so the DOM differs on purpose.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <WebVitals />
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
