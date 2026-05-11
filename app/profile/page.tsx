import { requireCurrentUser, requireHouseholdPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ProfileForm } from "@/components/ProfileForm";
import { HouseholdSettings } from "@/components/HouseholdSettings";

export default async function ProfilePage() {
  const user = await requireCurrentUser();
  const principal = await requireHouseholdPrincipal();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      measurementPref: true,
      conversionPrefs: true,
    },
  });
  const household = await prisma.household.findUnique({
    where: { id: principal.householdId },
    include: {
      members: {
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: "asc" },
      },
      apiTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          scopes: true,
          createdAt: true,
          lastUsedAt: true,
          revokedAt: true,
        },
      },
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
      {household ? (
        <HouseholdSettings
          householdName={household.name}
          role={principal.actorType === "user" ? principal.role : "MEMBER"}
          members={household.members.map((member) => ({
            id: member.id,
            email: member.user.email,
            role: member.role,
          }))}
          apiTokens={household.apiTokens.map((token) => ({
            ...token,
            createdAt: token.createdAt.toISOString(),
            lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
            revokedAt: token.revokedAt?.toISOString() ?? null,
          }))}
        />
      ) : null}
    </section>
  );
}
