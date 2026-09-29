import type { Metadata } from "next";
import { HouseholdProvider } from "@/components/household-provider";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "LunchBox — Your kitchen, connected",
  description:
    "Make more of what you have. Connect your pantry, meal plan, and shopping list.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <HouseholdProvider>
          <AppShell>{children}</AppShell>
        </HouseholdProvider>
      </body>
    </html>
  );
}
