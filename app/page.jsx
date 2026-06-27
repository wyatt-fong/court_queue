"use client";

import { useEffect, useRef, useState } from "react";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const demoAccounts = ["p1", "p2", "p3", "p4"];

async function apiRequest(path, init) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || "Request failed.");
  }

  return body;
}

function formatCountdown(lastRotatedAt, rotationMinutes) {
  const last = new Date(lastRotatedAt).getTime();
  const next = last + rotationMinutes * 60 * 1000;
  const diff = next - Date.now();

  if (diff <= 0) {
    return "Ready to rotate";
  }

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function HomePage() {
  const googleButtonRef = useRef(null);
  const googleInitializedRef = useRef(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState("");
  const [demoCredentials, setDemoCredentials] = useState({ username: "p1", password: "p1" });
  const [user, setUser] = useState(null);
  const [courts, setCourts] = useState([]);
  const [dummyNames, setDummyNames] = useState({});
  const [adminMode, setAdminMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  async function loadCourts() {
    const data = await apiRequest("/api/courts");
    setCourts(data.courts);
  }

  async function loadSession() {
    const data = await apiRequest("/api/auth/me");
    setUser(data.user);
    return data.user;
  }

  useEffect(() => {
    loadSession()
      .then((sessionUser) => {
        if (sessionUser) {
          return loadCourts();
        }

        return null;
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user || !googleClientId) {
      return;
    }

    if (window.google) {
      setGoogleReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleReady(true);
    script.onerror = () => setGoogleLoadError("Google sign-in script failed to load.");
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [user]);

  useEffect(() => {
    if (!googleReady || !googleButtonRef.current || googleInitializedRef.current || user) {
      return;
    }

    googleInitializedRef.current = true;
    googleButtonRef.current.innerHTML = "";

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        if (!response.credential) {
          setError("Google sign-in did not return a credential.");
          return;
        }

        setBusy("google-sign-in");
        setNotice("");
        setError("");

        try {
          const data = await apiRequest("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({ idToken: response.credential }),
          });
          setUser(data.user);
          setNotice("Signed in.");
          await loadCourts();
        } catch (requestError) {
          setError(requestError.message);
        } finally {
          setBusy("");
        }
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
  }, [googleReady, user]);

  async function handleJoin(courtId) {
    // TODO(party-slots): Replace this legacy flat-player join with
    // POST /api/courts/:courtId/parties for "Join End of Queue".
    setBusy(`join-${courtId}`);
    setNotice("");
    setError("");

    try {
      await apiRequest("/api/join", {
        method: "POST",
        body: JSON.stringify({ courtId }),
      });
      setNotice("Joined queue.");
      await loadCourts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleDemoLogin(event) {
    event.preventDefault();
    setBusy("demo-sign-in");
    setNotice("");
    setError("");

    try {
      const data = await apiRequest("/api/auth/demo", {
        method: "POST",
        body: JSON.stringify(demoCredentials),
      });
      setUser(data.user);
      setNotice("Signed in with demo account.");
      await loadCourts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleLeave(courtId, playerId) {
    // TODO(party-slots): Replace this legacy player removal with party-aware leave:
    // POST /api/parties/:partyId/leave for queued/active party membership.
    setBusy(`leave-${playerId}`);
    setNotice("");
    setError("");

    try {
      await apiRequest("/api/leave", {
        method: "POST",
        body: JSON.stringify({ courtId, playerId }),
      });
      setNotice("Removed from queue.");
      await loadCourts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleAdminAction(courtId, action) {
    // TODO(party-slots): Keep rotate/pause here, but add admin actions for canceling
    // queued parties, clearing active courts, and removing party members.
    setBusy(`${action}-${courtId}`);
    setNotice("");
    setError("");

    try {
      await apiRequest("/api/admin", {
        method: "POST",
        body: JSON.stringify({
          courtId,
          action,
          name: dummyNames[courtId] || "",
        }),
      });
      if (action === "add_dummy") {
        setDummyNames((current) => ({ ...current, [courtId]: "" }));
      }
      setNotice("Admin action completed.");
      await loadCourts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleLogout() {
    setBusy("logout");
    setNotice("");
    setError("");

    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
      window.google?.accounts.id.disableAutoSelect();
      setUser(null);
      setCourts([]);
      setAdminMode(false);
      googleInitializedRef.current = false;
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  const isAdmin = Boolean(user?.isAdmin);
  const adminControlsEnabled = isAdmin && adminMode;

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Badminton Club</p>
          <h1>Court Queue</h1>
          <p className="copy">
            Sign in with your UC San Diego Google account, pick a court, and join.
            Admins can rotate courts and add dummy players.
          </p>
        </div>

        {!user ? (
          <div className="card form-card">
            <h2>Sign In</h2>
            <form className="demo-login" onSubmit={handleDemoLogin}>
              <label>
                Username
                <input
                  autoComplete="username"
                  onChange={(event) =>
                    setDemoCredentials((current) => ({
                      ...current,
                      username: event.target.value,
                    }))
                  }
                  value={demoCredentials.username}
                />
              </label>
              <label>
                Password
                <input
                  autoComplete="current-password"
                  onChange={(event) =>
                    setDemoCredentials((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  type="password"
                  value={demoCredentials.password}
                />
              </label>
              <button disabled={busy === "demo-sign-in"} type="submit">
                {busy === "demo-sign-in" ? "Signing in..." : "Sign In"}
              </button>
            </form>
            <p className="subtle">
              Demo accounts: {demoAccounts.map((account) => `${account}/${account}`).join(", ")}.
              Player 1 is an admin.
            </p>
            {googleClientId ? (
              <>
                <div className="divider">or</div>
                <div ref={googleButtonRef} />
                {!googleReady ? <p className="notice">Loading Google sign-in...</p> : null}
                {googleLoadError ? <p className="error">{googleLoadError}</p> : null}
              </>
            ) : null}
          </div>
        ) : (
          <div className="card form-card">
            <h2>Signed In</h2>
            <p className="copy">
              Signed in as <strong>{user.displayName}</strong> ({user.email})
            </p>
            <p className="copy">Use the button on any court card to join that court’s queue.</p>
            {isAdmin ? (
              <label className="admin-toggle">
                <span>Admin mode</span>
                <button
                  className="secondary-button"
                  onClick={() => setAdminMode((current) => !current)}
                  type="button"
                >
                  {adminMode ? "On" : "Off"}
                </button>
              </label>
            ) : null}
            <button
              className="secondary-button"
              disabled={busy === "logout"}
              onClick={handleLogout}
              type="button"
            >
              {busy === "logout" ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        )}
      </section>

      <section className="status">
        {loading ? <p>Loading courts...</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="grid">
        {courts.map((court) => (
          <article className="card court-card" key={court.id}>
            <div className="court-head">
              <h3>Court {court.number}</h3>
              <span className={`badge ${court.paused ? "paused" : "active"}`}>
                {court.paused ? "paused" : "active"}
              </span>
            </div>

            <p className="subtle">
              Rotation in {formatCountdown(court.last_rotated_at, court.rotation_minutes)}
            </p>

            <div className="section">
              <h4>Playing</h4>
              {/* TODO(party-slots): Render court.activeParty.members, activeOpenSlots,
                  and a Join Active Court button when canJoinActiveCourt is true. */}
              <ul>
                {court.current_players.length ? (
                  court.current_players.map((player) => <li key={player.id}>{player.name}</li>)
                ) : (
                  <li>Open court</li>
                )}
              </ul>
            </div>

            <div className="section">
              <h4>Queue</h4>
              {/* TODO(party-slots): Render court.queuedParties as grouped party rows
                  with member names, count like 2/4, Join Party, Leave, and Cancel. */}
              <ul>
                {court.queue.length ? (
                  court.queue.map((player) => (
                    <li className="queue-row" key={player.id}>
                      <span>{player.name}</span>
                      {adminControlsEnabled || user?.id === player.id ? (
                        <button
                          disabled={busy === `leave-${player.id}`}
                          onClick={() =>
                            handleLeave(
                              court.id,
                              adminControlsEnabled ? player.id : undefined,
                            )
                          }
                          type="button"
                        >
                          Remove
                        </button>
                      ) : null}
                    </li>
                  ))
                ) : (
                  <li>No one waiting</li>
                )}
              </ul>
            </div>

            {user ? (
              // TODO(party-slots): Rename this to "Join End of Queue" and point it at
              // POST /api/courts/:courtId/parties.
              <button
                disabled={busy === `join-${court.id}`}
                onClick={() => handleJoin(court.id)}
                type="button"
              >
                {busy === `join-${court.id}` ? "Joining..." : `Queue For Court ${court.number}`}
              </button>
            ) : null}

            {adminControlsEnabled ? (
              <div className="admin-actions">
                <button
                  disabled={busy === `rotate-${court.id}`}
                  onClick={() => handleAdminAction(court.id, "rotate")}
                  type="button"
                >
                  Rotate Now
                </button>
                <button
                  disabled={busy === `toggle_pause-${court.id}`}
                  onClick={() => handleAdminAction(court.id, "toggle_pause")}
                  type="button"
                >
                  {court.paused ? "Resume" : "Pause"}
                </button>
              </div>
            ) : null}

            {adminControlsEnabled ? (
              <div className="dummy-row">
                <input
                  onChange={(event) =>
                    setDummyNames((current) => ({ ...current, [court.id]: event.target.value }))
                  }
                  placeholder="Dummy player name"
                  value={dummyNames[court.id] || ""}
                />
                <button
                  disabled={busy === `add_dummy-${court.id}`}
                  onClick={() => handleAdminAction(court.id, "add_dummy")}
                  type="button"
                >
                  Add Dummy
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
