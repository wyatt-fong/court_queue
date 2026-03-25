import { NextResponse } from "next/server";
import { joinCourtQueue } from "../../../lib/courts";
import { requireSessionUser } from "../../../lib/auth";

export async function POST(request) {
  try {
    const { courtId } = await request.json();
    const user = await requireSessionUser();
    await joinCourtQueue(user, courtId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
