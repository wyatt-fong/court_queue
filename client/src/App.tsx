import { useEffect, useRef, useState } from "react";

// Where backend lives, set via Vite env or default to localhost for development
const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
// Google Client ID for enabling Google sign-in, set via Vite env
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

type User = {
  id: string;
  email: string;
  role: "MEMBER" | "ADMIN";
  displayName?: string | null;
  isVerified?: boolean;
};

type Court = {
  id: string;
  number: number;
  status: "ACTIVE" | "PAUSED";
  cycleSeconds: number;
  nextRotationAt: string | null;
  waitingCount: number;
  players: Array<{
    id: string;
    email: string;
    displayName?: string | null;
    isPlaceholder?: boolean;
  }>;
};

type QueueEntry = {
  id: string;
  status: "WAITING" | "ASSIGNED" | "REMOVED";
  joinedAt: string;
};

type QueueState = {
  queueEntry: QueueEntry | null;
  position: number | null;
  court: {
    id: string;
    number: number;
  } | null;
};

type GoogleCredentialResponse = {
  credential?: string;
};

// Helper for making API requests to the backend with proper headers and error handling
async function apiRequest<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Request failed.");
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

function formatRotation(nextRotationAt: string | null) {
  if (!nextRotationAt) {
    return "Waiting to schedule";
  }

  const differenceMs = new Date(nextRotationAt).getTime() - Date.now();

  if (differenceMs <= 0) {
    return "Rotating now";
  }

  const totalSeconds = Math.floor(differenceMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPlayerLabel(email: string) {
  return email.split("@")[0];
}

function getPlayerLabel(player: Court["players"][number]) {
  return player.displayName?.trim() || formatPlayerLabel(player.email);
}

export default function App() {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const googleInitializedRef = useRef(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [courts, setCourts] = useState<Court[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [dummyNames, setDummyNames] = useState<Record<string, string>>({});
  const [queueState, setQueueState] = useState<QueueState>({
    queueEntry: null,
    position: null,
    court: null,
  });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Load courts, queue state, and waiting count from the backend to refresh the view
  async function refreshView() {
    const [courtsResponse, waitingResponse, queueResponse] = await Promise.all([
      apiRequest<{ courts: Court[] }>("/api/courts"),
      apiRequest<{ waitingCount: number }>("/api/queue/waiting"),
      apiRequest<QueueState>("/api/queue/me"),
    ]);

    setCourts(courtsResponse.courts);
    setWaitingCount(waitingResponse.waitingCount);
    setQueueState(queueResponse);
  }

  // Check session cookie for validity. If valid, load initial data. If not, show sign-in screen.
  async function loadSession() {
    try {
      const sessionResponse = await apiRequest<{ user: User }>("/api/auth/me");
      setUser(sessionResponse.user);
      await refreshView();
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshView().catch((requestError: unknown) => {
        const message =
          requestError instanceof Error ? requestError.message : "Could not refresh view.";
        setError(message);
      });
    }, 10000);

    return () => window.clearInterval(timer);
  }, [user]);

  useEffect(() => {
    if (user || !googleClientId) {
      return;
    }

    if (window.google) {
      setGoogleReady(true);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-identity="true"]',
    );

    if (existingScript) {
      const waitForGoogle = window.setInterval(() => {
        if (window.google) {
          setGoogleReady(true);
          window.clearInterval(waitForGoogle);
        }
      }, 250);

      return () => window.clearInterval(waitForGoogle);
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => {
      setGoogleReady(true);
      setGoogleLoadError(null);
    };
    script.onerror = () => {
      setGoogleLoadError("Google sign-in script failed to load.");
    };
    document.head.appendChild(script);
  }, [user]);

  useEffect(() => {
    if (user || !googleClientId || !googleButtonRef.current || googleInitializedRef.current) {
      return;
    }

    const renderGoogleButton = () => {
      if (!googleReady || !window.google || !googleButtonRef.current || googleInitializedRef.current) {
        return false;
      }

      googleInitializedRef.current = true;
      googleButtonRef.current.innerHTML = "";

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: (response: GoogleCredentialResponse) => {
          if (!response.credential) {
            setError("Google sign-in did not return a credential.");
            return;
          }

          setBusyAction("google-sign-in");
          setError(null);
          setNotice(null);

          void apiRequest<{ user: User }>("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({ idToken: response.credential }),
          })
            .then(async (sessionResponse) => {
              setUser(sessionResponse.user);
              setNotice("Signed in with Google.");
              await refreshView();
            })
            .catch((requestError: unknown) => {
              const message =
                requestError instanceof Error ? requestError.message : "Google sign-in failed.";
              setError(message);
            })
            .finally(() => {
              setBusyAction(null);
            });
        },
        hd: "ucsd.edu",
      });

      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "signin_with",
        width: 320,
      });

      return true;
    };

    if (renderGoogleButton()) {
      return;
    }

    const timer = window.setInterval(() => {
      if (renderGoogleButton()) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [googleReady, user]);

  async function handleJoinQueue(courtId: string) {
    setBusyAction("join-queue");
    setError(null);
    setNotice(null);

    try {
      await apiRequest("/api/queue/join", {
        method: "POST",
        body: JSON.stringify({ courtId }),
      });
      const selectedCourt = courts.find((court) => court.id === courtId);
      setNotice(
        selectedCourt
          ? `You joined the queue for Court ${selectedCourt.number}.`
          : "You joined the queue.",
      );
      await refreshView();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not join queue.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLeaveQueue() {
    setBusyAction("leave-queue");
    setError(null);
    setNotice(null);

    try {
      await apiRequest("/api/queue/leave", { method: "POST" });
      setNotice("You left the queue.");
      await refreshView();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not leave queue.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLogout() {
    setBusyAction("logout");
    setError(null);
    setNotice(null);

    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      window.google?.accounts.id.disableAutoSelect();
      setUser(null);
      setCourts([]);
      setWaitingCount(0);
      setQueueState({ queueEntry: null, position: null, court: null });
      setNotice("Signed out.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign out.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAdminAction(courtId: string, action: "pause" | "resume" | "rotate") {
    setBusyAction(`${action}-${courtId}`);
    setError(null);
    setNotice(null);

    try {
      await apiRequest(`/api/admin/courts/${courtId}/${action}`, { method: "POST" });
      setNotice(`Court ${action} completed.`);
      await refreshView();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Admin action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAddDummyPlayer(courtId: string) {
    const name = (dummyNames[courtId] ?? "").trim();

    if (!name) {
      setError("Enter a dummy player name first.");
      setNotice(null);
      return;
    }

    setBusyAction(`dummy-${courtId}`);
    setError(null);
    setNotice(null);

    try {
      await apiRequest(`/api/admin/courts/${courtId}/dummy`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setDummyNames((current) => ({ ...current, [courtId]: "" }));
      setNotice(`Added dummy player ${name}.`);
      await refreshView();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not add dummy player.");
    } finally {
      setBusyAction(null);
    }
  }

  const isWaiting = queueState.queueEntry?.status === "WAITING";
  const isAssigned = queueState.queueEntry?.status === "ASSIGNED";

  if (loading) {
    return (
      <main className="page-shell">
        <section className="panel status-panel">
          <p className="eyebrow">Loading</p>
          <h2>Checking session</h2>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page-shell">
        <section className="hero auth-hero">
          <div>
            <p className="eyebrow">Badminton Club</p>
            <h1>Court Queue</h1>
            <p className="hero-copy">
              Sign in with your UC San Diego Google account to access live
              courts, join a specific court queue, and rotate in.
            </p>
          </div>

          <div className="hero-card auth-card">
            <p className="stat-label">Google sign-in</p>
            <p className="muted">
              Only <strong>ucsd.edu</strong> Google Workspace accounts are allowed.
            </p>
            {googleClientId ? (
              <div className="google-button-shell" ref={googleButtonRef} />
            ) : (
              <p className="error">Missing `VITE_GOOGLE_CLIENT_ID` in the client env.</p>
            )}
            {googleClientId && !googleReady && !googleLoadError ? (
              <p className="notice">Loading Google sign-in...</p>
            ) : null}
            {googleLoadError ? <p className="error">{googleLoadError}</p> : null}
            {busyAction === "google-sign-in" ? <p className="notice">Signing you in...</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Badminton Club</p>
          <h1>Court Queue</h1>
          <p className="hero-copy">
            Signed in as <strong>{user.email}</strong>. Courts refresh every 10
            seconds and all queue actions are live against the backend.
          </p>
          {queueState.court ? (
            <p className="hero-copy">
              {isWaiting
                ? `You are queued for Court ${queueState.court.number}.`
                : `You are currently on Court ${queueState.court.number}.`}
            </p>
          ) : null}
          <div className="hero-actions">
            <button
              disabled={busyAction === "leave-queue" || !queueState.queueEntry}
              onClick={() => void handleLeaveQueue()}
              type="button"
            >
              Leave Queue
            </button>
            <button
              className="secondary-button"
              disabled={busyAction === "logout"}
              onClick={() => void handleLogout()}
              type="button"
            >
              {busyAction === "logout" ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>

        <div className="hero-card">
          <p className="stat-label">Queue</p>
          <p className="stat-value">{waitingCount}</p>
          <p className="queue-summary">
            {isWaiting && queueState.position
              ? `You are #${queueState.position} for Court ${queueState.court?.number}.`
              : isAssigned
                ? `You are assigned to Court ${queueState.court?.number}.`
                : "Pick a court below to join its queue."}
          </p>
          <p className="muted">Total waiting across all courts.</p>
        </div>
      </section>

      {(notice || error) && (
        <section className="panel status-panel">
          {notice ? <p className="notice">{notice}</p> : null}
          {error ? <p className="error">{error}</p> : null}
        </section>
      )}

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live view</p>
            <h2>Courts</h2>
          </div>
          <p className="muted">
            {user.role === "ADMIN"
              ? "Admin controls are enabled for your account."
              : "Member view only."}
          </p>
        </div>

        <div className="court-grid">
          {courts.map((court) => (
            <article className="court-card" key={court.id}>
              <div className="court-card-header">
                <h3>Court {court.number}</h3>
                <span className={`badge badge-${court.status.toLowerCase()}`}>
                  {court.status.toLowerCase()}
                </span>
              </div>

              <p className="timer">Next rotation: {formatRotation(court.nextRotationAt)}</p>
              <p className="timer">Queue waiting: {court.waitingCount}</p>

              <ul className="player-list">
                {court.players.length > 0 ? (
                  court.players.map((player) => (
                    <li key={player.id}>{getPlayerLabel(player)}</li>
                  ))
                ) : (
                  <li className="empty">Open court</li>
                )}
              </ul>

              {!queueState.queueEntry ? (
                <button
                  disabled={busyAction === "join-queue" || court.status !== "ACTIVE"}
                  onClick={() => void handleJoinQueue(court.id)}
                  type="button"
                >
                  {busyAction === "join-queue" ? "Joining..." : `Queue for Court ${court.number}`}
                </button>
              ) : null}

              {user.role === "ADMIN" ? (
                <div className="admin-actions">
                  <button
                    className="secondary-button small-button"
                    disabled={busyAction === `pause-${court.id}` || court.status === "PAUSED"}
                    onClick={() => void handleAdminAction(court.id, "pause")}
                    type="button"
                  >
                    Pause
                  </button>
                  <button
                    className="secondary-button small-button"
                    disabled={busyAction === `resume-${court.id}` || court.status === "ACTIVE"}
                    onClick={() => void handleAdminAction(court.id, "resume")}
                    type="button"
                  >
                    Resume
                  </button>
                  <button
                    className="secondary-button small-button"
                    disabled={busyAction === `rotate-${court.id}`}
                    onClick={() => void handleAdminAction(court.id, "rotate")}
                    type="button"
                  >
                    Rotate now
                  </button>
                </div>
              ) : null}

              {user.role === "ADMIN" ? (
                <div className="dummy-player-form">
                  <input
                    onChange={(event) =>
                      setDummyNames((current) => ({
                        ...current,
                        [court.id]: event.target.value,
                      }))
                    }
                    placeholder="Dummy player name"
                    value={dummyNames[court.id] ?? ""}
                  />
                  <button
                    className="secondary-button small-button"
                    disabled={busyAction === `dummy-${court.id}`}
                    onClick={() => void handleAddDummyPlayer(court.id)}
                    type="button"
                  >
                    {busyAction === `dummy-${court.id}` ? "Adding..." : "Add Dummy"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
