import { NextResponse } from "next/server";
import { requireAdminUser } from "../../../lib/auth";
import { adminAddDummy, adminRotateCourt, adminTogglePause } from "../../../lib/courts";
import {
  adminAddDemoDummy,
  adminRotateDemoCourt,
  adminToggleDemoPause,
} from "../../../lib/demo-courts";

export async function POST(request) {
  try {
    // TODO(party-slots): Extend this route or split admin party endpoints for:
    // cancel queued party, clear active court, and remove party member.
    const { action, courtId, name } = await request.json();
    const user = await requireAdminUser();

    if (user.is_demo) {
        switch (action) {
            case "rotate":
                adminRotateDemoCourt(courtId);
                break;
            case "toggle_pause":
                adminToggleDemoPause(courtId);
                break;
            case "add_dummy":
                adminAddDemoDummy(courtId, name);
                break;
            case "remove_party_member":
            case "clear_active_court":
            case "cancel_queued_party":
                return NextResponse.json(
                { error: "Demo party admin action is not implemented yet." },
                { status: 501 },
            );
            default:
                return NextResponse.json({ error: "Unknown admin action for demo user." }, { status: 400 });
        }
    } else if (action === "rotate") {
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
