import { QueueEntryStatus } from "@prisma/client";
import { prisma } from "./db.js";

export async function userHasActiveQueueEntry(userId: string) {
  const activeEntry = await prisma.queueEntry.findFirst({
    where: {
      userId,
      status: {
        in: [QueueEntryStatus.WAITING, QueueEntryStatus.ASSIGNED],
      },
    },
  });

  return Boolean(activeEntry);
}

export async function userHasActiveCourtAssignment(userId: string) {
  const assignment = await prisma.courtAssignment.findFirst({
    where: {
      userId,
      active: true,
    },
  });

  return Boolean(assignment);
}

