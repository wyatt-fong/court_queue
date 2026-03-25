import { NextResponse } from "next/server";
import { config } from "../../../lib/config";
import { adminAddDummy, adminRotateCourt, adminTogglePause } from "../../../lib/courts";

export async function POST(request) {
  try {
    const { adminPasscode, action, courtId, name } = await request.json();

    if (!config.adminPasscode || adminPasscode !== config.adminPasscode) {
      return NextResponse.json({ error: "Invalid admin passcode." }, { status: 401 });
    }

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
