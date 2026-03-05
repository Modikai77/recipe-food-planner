import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProfileForm } from "@/components/ProfileForm";

export default async function ProfilePage() {
  const user = await requireCurrentUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      measurementPref: true,
      conversionPrefs: true,
    },
  });

  const prefs = (profile?.conversionPrefs as Record<string, unknown> | null) ?? {};

  return (
    <section style={{ padding: "1rem 0 2rem" }}>
      <h2>Profile</h2>
      <p className="muted">Signed in as {profile?.email}</p>
      <ProfileForm
        initialMeasurementPref={(profile?.measurementPref as "UK" | "US" | "METRIC" | undefined) ?? "UK"}
        initialKeepSmallVolumeUnits={Boolean(prefs.keepSmallVolumeUnits)}
        initialForceMetricMass={prefs.forceMetricMass !== false}
      />
    </section>
  );
}
