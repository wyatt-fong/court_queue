import { NextResponse } from "next/server";
import { joinCourtQueue } from "../../../lib/courts";
import { requireSessionUser } from "../../../lib/auth";
import { joinDemoCourtQueue } from "../../../lib/demo-courts";

export async function POST(request) {
  try {
    // TODO(party-slots): Retire this legacy endpoint after the frontend calls
    // POST /api/courts/:courtId/parties for "Join End of Queue".
    const { courtId } = await request.json();
    const user = await requireSessionUser();

    if (user.is_demo) {
      joinDemoCourtQueue(user, courtId);
    } else {
      await joinCourtQueue(user, courtId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
