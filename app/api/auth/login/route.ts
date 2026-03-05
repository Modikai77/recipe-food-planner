import { NextRequest, NextResponse } from "next/server";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/http";
import { LoginSchema } from "@/lib/schemas/api";

export async function POST(request: NextRequest) {
  try {
    const parsed = LoginSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash) {
      return badRequest("Invalid email or password");
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      return badRequest("Invalid email or password");
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to login");
  }
}
