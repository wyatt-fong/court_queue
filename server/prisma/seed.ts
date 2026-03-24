import { PrismaClient, Role } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
  for (let number = 1; number <= 10; number += 1) {
    await prisma.court.upsert({
      where: { number },
      update: {
        cycleSeconds: 300,
        nextRotationAt: new Date(Date.now() + 300_000),
      },
      create: {
        number,
        cycleSeconds: 300,
        nextRotationAt: new Date(Date.now() + 300_000),
      },
    });
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  for (const email of adminEmails) {
    await prisma.user.upsert({
      where: { email },
      update: { role: Role.ADMIN, isVerified: true },
      create: { email, role: Role.ADMIN, isVerified: true },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

