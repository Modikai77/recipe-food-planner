import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/recipes");
  }

  return (
    <section className="card" style={{ marginTop: "1rem" }}>
      <h2>Recipe Database + Meal Planner</h2>
      <p>
        Import recipes from photos or URLs, review structured ingredients and steps, auto-tag recipes,
        and generate meal plans with consolidated shopping lists.
      </p>
      <p>
        Start with <a href="/register">Create Account</a> or <a href="/login">Login</a>.
      </p>
    </section>
  );
}
