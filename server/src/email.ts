import { Resend } from "resend";
import { config } from "./config.js";

const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null;

export async function sendVerificationCode(email: string, code: string) {
  if (!resend || !config.RESEND_FROM_EMAIL) {
    console.log(`[email disabled] Verification code for ${email}: ${code}`);
    return;
  }

  await resend.emails.send({
    from: config.RESEND_FROM_EMAIL,
    to: email,
    subject: "Your Court Queue verification code",
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
}

