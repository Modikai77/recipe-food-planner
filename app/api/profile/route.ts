import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { badRequest, serverError } from "@/lib/http";
import { ProfileUpdateSchema } from "@/lib/schemas/api";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        measurementPref: true,
        conversionPrefs: true,
      },
    });

    return NextResponse.json(profile);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to load profile");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = ProfileUpdateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return badRequest(parsed.error.message);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        measurementPref: parsed.data.measurementPref,
        conversionPrefs: parsed.data.conversionPrefs,
      },
      select: {
        id: true,
        email: true,
        measurementPref: true,
        conversionPrefs: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to update profile");
  }
}
