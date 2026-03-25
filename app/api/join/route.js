import { NextResponse } from "next/server";
import { joinCourtQueue } from "../../../lib/courts";

export async function POST(request) {
  try {
    const { name, courtId } = await request.json();
    await joinCourtQueue(name, courtId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
