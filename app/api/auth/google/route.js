import { NextResponse } from "next/server";
import { createSession, upsertUserFromGoogle, verifyGoogleIdToken } from "../../../../lib/auth";

export async function POST(request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: "Google ID token is required." }, { status: 400 });
    }

    const googleProfile = await verifyGoogleIdToken(idToken);
    const user = await upsertUserFromGoogle(googleProfile);
    await createSession(user);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: user.is_admin,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
