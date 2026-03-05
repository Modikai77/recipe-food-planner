import { NextResponse } from "next/server";
import { deleteSessionForCurrentRequest } from "@/lib/auth";
import { serverError } from "@/lib/http";

export async function POST() {
  try {
    await deleteSessionForCurrentRequest();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to logout");
  }
}
