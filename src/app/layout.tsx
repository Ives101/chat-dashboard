import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";
import { ToastProvider } from "@/components/Toast";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import OfflineIndicator from "@/components/OfflineIndicator";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chat Dashboard",
  description: "ChatGPT-style chat dashboard with sidebar, folders, and search",
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full dark" suppressHydrationWarning>
      <body className="h-full m-0">
        <ThemeProvider>
          <ToastProvider>
            <ServiceWorkerRegistration />
            <OfflineIndicator />
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}