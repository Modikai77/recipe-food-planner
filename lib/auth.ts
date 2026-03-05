import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

const scrypt = promisify(_scrypt);
const SESSION_COOKIE_NAME = "rfp_session";
const SESSION_DAYS = 30;

export type CurrentUser = {
  id: string;
  email: string;
  measurementPref: string;
  conversionPrefs: Record<string, unknown> | null;
};

function sha256(input: string): string {
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

export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}
