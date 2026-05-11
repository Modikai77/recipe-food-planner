import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { HouseholdRole } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

const scrypt = promisify(_scrypt);
const SESSION_COOKIE_NAME = "rfp_session";
const SESSION_DAYS = 30;
export const API_TOKEN_PREFIX = "rfp_";

export const JARVIS_DEFAULT_SCOPES = [
  "recipes:read",
  "recipes:write",
  "shoppingLists:read",
  "shoppingLists:write",
  "mealPlans:read",
] as const;

export type ApiScope =
  | "recipes:read"
  | "recipes:write"
  | "recipes:archive"
  | "recipes:delete"
  | "shoppingLists:read"
  | "shoppingLists:write"
  | "mealPlans:read"
  | "mealPlans:write"
  | "household:admin";

export type CurrentUser = {
  id: string;
  email: string;
  measurementPref: string;
  conversionPrefs: Record<string, unknown> | null;
};

export type HouseholdPrincipal =
  | {
      actorType: "user";
      userId: string;
      email: string;
      householdId: string;
      role: HouseholdRole;
      scopes: ApiScope[];
      measurementPref: string;
      conversionPrefs: Record<string, unknown> | null;
    }
  | {
      actorType: "apiToken";
      apiTokenId: string;
      householdId: string;
      tokenName: string;
      scopes: ApiScope[];
      measurementPref: string;
      conversionPrefs: Record<string, unknown> | null;
    };

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  const [salt, storedHex] = passwordHash.split(":");
  if (!salt || !storedHex) {
    return false;
  }

  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const stored = Buffer.from(storedHex, "hex");
  if (derived.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(derived, stored);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function deleteSessionForCurrentRequest(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  await clearSessionCookie();
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionToken) {
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(sessionToken) },
      include: { user: true },
    });

    if (session && session.expiresAt > new Date()) {
      return {
        id: session.user.id,
        email: session.user.email,
        measurementPref: session.user.measurementPref,
        conversionPrefs: (session.user.conversionPrefs as Record<string, unknown> | null) ?? null,
      };
    }
  }

  // For local API testing only.
  const h = await headers();
  const headerId = h.get("x-user-id");
  if (headerId) {
    const user = await prisma.user.findUnique({ where: { id: headerId } });
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      measurementPref: user.measurementPref,
      conversionPrefs: (user.conversionPrefs as Record<string, unknown> | null) ?? null,
    };
  }

  return null;
}

function householdNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "Home";
  return `${local}'s household`;
}

async function backfillUserRowsToHousehold(userId: string, householdId: string): Promise<void> {
  await Promise.all([
    prisma.recipe.updateMany({
      where: { userId, householdId: null },
      data: { householdId, createdByUserId: userId },
    }),
    prisma.tag.updateMany({
      where: { userId, householdId: null },
      data: { householdId },
    }),
    prisma.ingestionJob.updateMany({
      where: { userId, householdId: null },
      data: { householdId, createdByUserId: userId },
    }),
    prisma.mealPlan.updateMany({
      where: { userId, householdId: null },
      data: { householdId, createdByUserId: userId },
    }),
    prisma.shoppingList.updateMany({
      where: { userId, householdId: null },
      data: { householdId, createdByUserId: userId },
    }),
  ]);
}

export async function ensureDefaultHouseholdForUser(userId: string): Promise<{
  householdId: string;
  role: HouseholdRole;
}> {
  const membership = await prisma.householdMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { householdId: true, role: true },
  });

  if (membership) {
    await backfillUserRowsToHousehold(userId, membership.householdId);
    return membership;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      locale: true,
      measurementPref: true,
      conversionPrefs: true,
    },
  });

  const household = await prisma.household.create({
    data: {
      name: householdNameFromEmail(user.email),
      defaultLocale: user.locale,
      measurementPref: user.measurementPref,
      conversionPrefs: user.conversionPrefs ?? undefined,
      createdByUserId: userId,
      members: {
        create: {
          userId,
          role: HouseholdRole.OWNER,
        },
      },
    },
    select: { id: true },
  });

  await backfillUserRowsToHousehold(userId, household.id);
  return { householdId: household.id, role: HouseholdRole.OWNER };
}

async function getPrincipalFromApiToken(): Promise<HouseholdPrincipal | null | "invalid"> {
  const h = await headers();
  const authorization = h.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const token = authorization.slice("bearer ".length).trim();
  if (!token) {
    return "invalid";
  }

  const apiToken = await prisma.apiToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { household: true },
  });

  if (!apiToken || apiToken.revokedAt) {
    return "invalid";
  }

  await prisma.apiToken.update({
    where: { id: apiToken.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    actorType: "apiToken",
    apiTokenId: apiToken.id,
    householdId: apiToken.householdId,
    tokenName: apiToken.name,
    scopes: apiToken.scopes as ApiScope[],
    measurementPref: apiToken.household.measurementPref,
    conversionPrefs: (apiToken.household.conversionPrefs as Record<string, unknown> | null) ?? null,
  };
}

export async function getHouseholdPrincipal(): Promise<HouseholdPrincipal | null> {
  const tokenPrincipal = await getPrincipalFromApiToken();
  if (tokenPrincipal === "invalid") {
    return null;
  }
  if (tokenPrincipal) {
    return tokenPrincipal;
  }

  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const membership = await ensureDefaultHouseholdForUser(user.id);
  return {
    actorType: "user",
    userId: user.id,
    email: user.email,
    householdId: membership.householdId,
    role: membership.role,
    scopes: [
      "recipes:read",
      "recipes:write",
      "recipes:archive",
      "recipes:delete",
      "shoppingLists:read",
      "shoppingLists:write",
      "mealPlans:read",
      "mealPlans:write",
      ...(membership.role === HouseholdRole.OWNER ? (["household:admin"] as ApiScope[]) : []),
    ],
    measurementPref: user.measurementPref,
    conversionPrefs: user.conversionPrefs,
  };
}

export async function requireHouseholdPrincipal(): Promise<HouseholdPrincipal> {
  const principal = await getHouseholdPrincipal();
  if (!principal) {
    redirect("/login");
  }

  return principal;
}

export function hasScope(principal: HouseholdPrincipal, scope: ApiScope): boolean {
  return principal.scopes.includes(scope);
}

export function createApiTokenSecret(): string {
  return `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  await ensureDefaultHouseholdForUser(user.id);
  return user;
}
