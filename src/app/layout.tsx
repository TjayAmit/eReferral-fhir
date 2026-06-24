import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth";
import { SettingsProvider } from "@/lib/settings-context";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "PH eReferral — Track 1",
  description: "Use Case 1 (submit eReferral Bundle) & Use Case 2 (retrieve + action points)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SettingsProvider>
            <AppShell>{children}</AppShell>
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
