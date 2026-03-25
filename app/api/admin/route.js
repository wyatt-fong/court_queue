import { NextResponse } from "next/server";
import { requireAdminUser } from "../../../lib/auth";
import { adminAddDummy, adminRotateCourt, adminTogglePause } from "../../../lib/courts";

export async function POST(request) {
  try {
    const { action, courtId, name } = await request.json();
    await requireAdminUser();

    if (action === "rotate") {
      await adminRotateCourt(courtId);
    } else if (action === "toggle_pause") {
      await adminTogglePause(courtId);
    } else if (action === "add_dummy") {
      await adminAddDummy(courtId, name);
    } else {
      return NextResponse.json({ error: "Unknown admin action." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
