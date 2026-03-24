import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { CourtStatus, QueueEntryStatus, Role } from "@prisma/client";
import { clearSessionCookie, setSessionCookie, signSession } from "./auth.js";
import { config, adminEmails } from "./config.js";
import { prisma } from "./db.js";
import { sendVerificationCode } from "./email.js";
import { authenticateGoogleIdToken, establishGoogleSession } from "./google-auth.js";
import { requireAdmin, requireAuth } from "./middleware.js";
import { userHasActiveCourtAssignment, userHasActiveQueueEntry } from "./queue.js";
import { forceRotateCourt } from "./rotation.js";
import {
  createPlaceholderEmail,
  createVerificationCode,
  getEmailDomain,
  hashCode,
  normalizeEmail,
} from "./utils.js";

const app = express();

app.use(
  cors({
    origin: config.APP_URL,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/auth/google", async (request, response) => {
  const idToken = String(request.body.idToken ?? "");

  if (!idToken) {
    response.status(400).json({ error: "Google ID token is required." });
    return;
  }

  try {
    const user = await authenticateGoogleIdToken(idToken);
    establishGoogleSession(response, user);

    response.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google sign-in failed.";
    response.status(401).json({ error: message });
  }
});

app.post("/api/auth/logout", (_request, response) => {
  clearSessionCookie(response);
  response.status(204).send();
});

app.get("/api/auth/me", requireAuth, async (request, response) => {
  const user = await prisma.user.findUnique({
    where: { id: request.session!.sub },
    select: { id: true, email: true, role: true, isVerified: true },
  });

  response.json({ user });
});

app.get("/api/courts", requireAuth, async (_request, response) => {
  const [courts, waitingGroups] = await Promise.all([
    prisma.court.findMany({
      orderBy: { number: "asc" },
      include: {
        assignments: {
          where: { active: true },
          include: {
            user: {
              select: { id: true, email: true, displayName: true, isPlaceholder: true },
            },
          },
        },
      },
    }),
    prisma.queueEntry.groupBy({
      by: ["courtId"],
      where: { status: QueueEntryStatus.WAITING },
      _count: { _all: true },
    }),
  ]);

  const waitingCountByCourt = new Map(
    waitingGroups.map((group) => [group.courtId, group._count._all]),
  );

  response.json({
    courts: courts.map((court) => ({
      id: court.id,
      number: court.number,
      status: court.status,
      cycleSeconds: court.cycleSeconds,
      nextRotationAt: court.nextRotationAt,
      waitingCount: waitingCountByCourt.get(court.id) ?? 0,
      players: court.assignments.map((assignment) => assignment.user),
    })),
  });
});

app.get("/api/queue/me", requireAuth, async (request, response) => {
  const activeEntry = await prisma.queueEntry.findFirst({
    where: {
      userId: request.session!.sub,
      status: {
        in: [QueueEntryStatus.WAITING, QueueEntryStatus.ASSIGNED],
      },
    },
    orderBy: { joinedAt: "asc" },
    include: {
      court: {
        select: { id: true, number: true },
      },
    },
  });

  if (!activeEntry) {
    response.json({ queueEntry: null, position: null, court: null });
    return;
  }

  const aheadCount = await prisma.queueEntry.count({
    where: {
      courtId: activeEntry.courtId,
      status: QueueEntryStatus.WAITING,
      joinedAt: { lt: activeEntry.joinedAt },
    },
  });

  response.json({
    queueEntry: activeEntry,
    court: activeEntry.court,
    position: activeEntry.status === QueueEntryStatus.WAITING ? aheadCount + 1 : null,
  });
});

app.get("/api/queue/waiting", requireAuth, async (_request, response) => {
  const waitingCount = await prisma.queueEntry.count({
    where: { status: QueueEntryStatus.WAITING },
  });

  response.json({ waitingCount });
});

app.post("/api/queue/join", requireAuth, async (request, response) => {
  const userId = request.session!.sub;
  const courtId = String(request.body.courtId ?? "");

  if (!courtId) {
    response.status(400).json({ error: "Court selection is required." });
    return;
  }

  if (await userHasActiveQueueEntry(userId)) {
    response.status(409).json({ error: "You are already in the queue." });
    return;
  }

  if (await userHasActiveCourtAssignment(userId)) {
    response.status(409).json({ error: "You are already assigned to a court." });
    return;
  }

  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: {
      assignments: {
        where: { active: true },
        select: { id: true },
      },
    },
  });

  if (!court) {
    response.status(404).json({ error: "Court not found." });
    return;
  }

  if (court.status !== CourtStatus.ACTIVE) {
    response.status(409).json({ error: "That court is currently paused." });
    return;
  }

  const queueEntry = await prisma.queueEntry.create({
    data: {
      userId,
      courtId,
      status: QueueEntryStatus.WAITING,
    },
  });

  if (court.assignments.length === 0) {
    await forceRotateCourt(courtId);
  }

  response.status(201).json({ queueEntry });
});

app.post("/api/queue/leave", requireAuth, async (request, response) => {
  const userId = request.session!.sub;
  const now = new Date();

  await prisma.queueEntry.updateMany({
    where: {
      userId,
      status: QueueEntryStatus.WAITING,
    },
    data: {
      status: QueueEntryStatus.REMOVED,
      removedAt: now,
    },
  });

  response.status(204).send();
});

app.post("/api/admin/courts/:courtId/pause", requireAuth, requireAdmin, async (request, response) => {
  const courtId = String(request.params.courtId);
  const court = await prisma.court.update({
    where: { id: courtId },
    data: { status: CourtStatus.PAUSED },
  });

  response.json({ court });
});

app.post("/api/admin/courts/:courtId/resume", requireAuth, requireAdmin, async (request, response) => {
  const courtId = String(request.params.courtId);
  const court = await prisma.court.update({
    where: { id: courtId },
    data: {
      status: CourtStatus.ACTIVE,
      nextRotationAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  response.json({ court });
});

app.post("/api/admin/courts/:courtId/rotate", requireAuth, requireAdmin, async (request, response) => {
  const courtId = String(request.params.courtId);
  await forceRotateCourt(courtId);
  response.status(204).send();
});

app.post("/api/admin/courts/:courtId/dummy", requireAuth, requireAdmin, async (request, response) => {
  const courtId = String(request.params.courtId);
  const name = String(request.body.name ?? "").trim();

  if (!name) {
    response.status(400).json({ error: "Dummy player name is required." });
    return;
  }

  const court = await prisma.court.findUnique({
    where: { id: courtId },
    include: {
      assignments: {
        where: { active: true },
        select: { id: true },
      },
    },
  });

  if (!court) {
    response.status(404).json({ error: "Court not found." });
    return;
  }

  if (court.status !== CourtStatus.ACTIVE) {
    response.status(409).json({ error: "That court is currently paused." });
    return;
  }

  const placeholderUser = await prisma.user.create({
    data: {
      email: createPlaceholderEmail(name),
      displayName: name,
      isPlaceholder: true,
      isVerified: true,
      role: Role.MEMBER,
    },
  });

  await prisma.queueEntry.create({
    data: {
      userId: placeholderUser.id,
      courtId,
      status: QueueEntryStatus.WAITING,
    },
  });

  if (court.assignments.length === 0) {
    await forceRotateCourt(courtId);
  }

  response.status(201).json({
    player: {
      id: placeholderUser.id,
      displayName: placeholderUser.displayName,
    },
  });
});

export { app };
