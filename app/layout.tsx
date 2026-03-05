import type { Metadata, Viewport } from "next";
import { LogoutButton } from "@/components/LogoutButton";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Recipe and Food Planner",
  description: "Recipe ingestion, tagging, planning, and shopping list app",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <h1>Recipe and Food Planner</h1>
            <nav>
              {user ? (
                <>
                  <a href="/recipes">Recipes</a>
                  <a href="/planner">Planner</a>
                  <a href="/profile">Profile</a>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <a href="/login">Login</a>
                  <a href="/register">Register</a>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
