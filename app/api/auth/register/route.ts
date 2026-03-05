import { NextRequest, NextResponse } from "next/server";
import { createSession, hashPassword, setSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/http";
import { RegisterSchema } from "@/lib/schemas/api";

export async function POST(request: NextRequest) {
  try {
    const parsed = RegisterSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return badRequest("Email already registered");
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        locale: "en-GB",
        measurementPref: "UK",
        conversionPrefs: {
          keepSmallVolumeUnits: false,
          forceMetricMass: true,
        },
      },
    });

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({ ok: true, userId: user.id });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to register");
  }
}
