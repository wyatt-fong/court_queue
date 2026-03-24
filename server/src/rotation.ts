import { CourtStatus, QueueEntryStatus } from "@prisma/client";
import { prisma } from "./db.js";

const TICK_MS = 15_000;

async function rotateCourt(courtId: string) {
  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: {
      assignments: {
        where: { active: true },
      },
    },
  });

  if (!court || court.status !== CourtStatus.ACTIVE) {
    return;
  }

  const now = new Date();
  const nextPlayers = await prisma.queueEntry.findMany({
    where: {
      status: QueueEntryStatus.WAITING,
      courtId,
    },
    orderBy: { joinedAt: "asc" },
    take: 4,
  });

  await prisma.$transaction(async (tx) => {
    await tx.courtAssignment.updateMany({
      where: { courtId, active: true },
      data: { active: false, cycleEnd: now },
    });

    if (court.assignments.length > 0) {
      await tx.queueEntry.updateMany({
        where: {
          userId: {
            in: court.assignments.map((assignment) => assignment.userId),
          },
          status: QueueEntryStatus.ASSIGNED,
        },
        data: { status: QueueEntryStatus.REMOVED, removedAt: now },
      });
    }

    if (nextPlayers.length > 0) {
      await tx.queueEntry.updateMany({
        where: { id: { in: nextPlayers.map((entry) => entry.id) } },
        data: { status: QueueEntryStatus.ASSIGNED },
      });

      await tx.courtAssignment.createMany({
        data: nextPlayers.map((entry) => ({
          courtId,
          userId: entry.userId,
          cycleStart: now,
          cycleEnd: new Date(now.getTime() + court.cycleSeconds * 1000),
          active: true,
        })),
      });
    }

    await tx.court.update({
      where: { id: courtId },
      data: {
        nextRotationAt: new Date(now.getTime() + court.cycleSeconds * 1000),
      },
    });
  });
}

export function startRotationWorker() {
  return setInterval(async () => {
    const dueCourts = await prisma.court.findMany({
      where: {
        status: CourtStatus.ACTIVE,
        nextRotationAt: { lte: new Date() },
      },
      select: { id: true },
    });

    for (const court of dueCourts) {
      await rotateCourt(court.id);
    }
  }, TICK_MS);
}

export async function forceRotateCourt(courtId: string) {
  await rotateCourt(courtId);
}
