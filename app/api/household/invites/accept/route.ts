import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, sha256 } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError, unauthorized } from "@/lib/http";
import { HouseholdInviteAcceptSchema } from "@/lib/schemas/api";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return unauthorized();
    }

    const parsed = HouseholdInviteAcceptSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const invite = await prisma.householdInvite.findUnique({
      where: { tokenHash: sha256(parsed.data.token) },
    });

    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
      return badRequest("Invite is invalid or expired");
    }

    if (invite.email !== user.email.trim().toLowerCase()) {
      return badRequest("Invite was sent to a different email address");
    }

    await prisma.$transaction([
      prisma.householdMember.upsert({
        where: {
          householdId_userId: {
            householdId: invite.householdId,
            userId: user.id,
          },
        },
        update: { role: invite.role },
        create: {
          householdId: invite.householdId,
          userId: user.id,
          role: invite.role,
        },
      }),
      prisma.householdInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true, householdId: invite.householdId });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to accept invite");
  }
}
