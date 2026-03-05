import { PlannerClient } from "@/components/PlannerClient";
import { requireCurrentUser } from "@/lib/auth";

export default async function PlannerPage() {
  await requireCurrentUser();

  return (
    <section style={{ padding: "1rem 0 2rem" }}>
      <h2>Meal Planner</h2>
      <p className="muted">
        Generate recommendations for parents and kids using recipe tags and dietary filters.
      </p>
      <PlannerClient />
    </section>
  );
}
