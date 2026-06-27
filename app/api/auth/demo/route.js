import { NextResponse } from "next/server";
import { signInDemoUser } from "../../../../lib/auth";

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    const user = await signInDemoUser(username, password);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        isAdmin: user.is_admin,
        isDemo: user.is_demo,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
}
