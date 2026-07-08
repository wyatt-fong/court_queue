"use client";

import { useEffect, useRef, useState } from "react";

const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

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
  const nextRotation = new Date(lastRotatedAt).getTime() + rotationMinutes * 60 * 1000;
  const difference = nextRotation - Date.now();

  if (difference <= 0) return "Ready";

  const seconds = Math.floor(difference / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function HomePage() {
  const googleButtonRef = useRef(null);
  const googleInitializedRef = useRef(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [user, setUser] = useState(null);
  const [gym, setGym] = useState("MAIN");
  const [courts, setCourts] = useState([]);
  const [adminMode, setAdminMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadCourts(nextGym = gym) {
    const data = await apiRequest(`/api/courts?gym=${nextGym}`);
    setCourts(data.courts);
  }

  async function refreshAfter(action, message, operation) {
    setBusy(action);
    setNotice("");
    setError("");

    try {
      await operation();
      setNotice(message);
      await loadCourts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    apiRequest("/api/auth/me")
      .then(async ({ user: sessionUser }) => {
        setUser(sessionUser);
        if (sessionUser) await loadCourts("MAIN");
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    loadCourts(gym).catch((requestError) => setError(requestError.message));
    const interval = window.setInterval(() => {
      loadCourts(gym).catch(() => {});
    }, 10000);

    return () => window.clearInterval(interval);
  }, [gym, user]);

  useEffect(() => {
    if (user || !googleClientId) return undefined;
    if (window.google) {
      setGoogleReady(true);
      return undefined;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleReady(true);
    script.onerror = () => setError("Google sign-in failed to load.");
    document.head.appendChild(script);

    return () => script.remove();
  }, [user]);

  useEffect(() => {
    if (!googleReady || !googleButtonRef.current || googleInitializedRef.current || user) {
      return;
    }

    googleInitializedRef.current = true;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      hd: "ucsd.edu",
      callback: async ({ credential }) => {
        if (!credential) return;

        setBusy("sign-in");
        setError("");
        try {
          const data = await apiRequest("/api/auth/google", {
            method: "POST",
            body: JSON.stringify({ idToken: credential }),
          });
          setUser(data.user);
          setNotice("Signed in.");
          await loadCourts("MAIN");
        } catch (requestError) {
          setError(requestError.message);
        } finally {
          setBusy("");
        }
      },
    });
    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      width: 300,
    });
  }, [googleReady, user]);

  async function createParty(court) {
    await refreshAfter(
      `create-${court.id}`,
      court.canSwitchToNewParty ? "Switched queues." : "Joined the queue.",
      () =>
        apiRequest(`/api/courts/${court.id}/parties`, {
          method: "POST",
          body: JSON.stringify({ switchQueue: court.canSwitchToNewParty }),
        }),
    );
  }

  async function joinParty(party) {
    await refreshAfter(
      `join-${party.id}`,
      party.canSwitchToParty ? "Switched parties." : "Joined party.",
      () =>
        apiRequest(`/api/parties/${party.id}/join`, {
          method: "POST",
          body: JSON.stringify({ switchQueue: party.canSwitchToParty }),
        }),
    );
  }

  async function joinActive(court) {
    await refreshAfter(`active-${court.id}`, "Joined active court.", () =>
      apiRequest(`/api/courts/${court.id}/join-active`, { method: "POST" }),
    );
  }

  async function leaveParty(partyId) {
    await refreshAfter(`leave-${partyId}`, "Left party.", () =>
      apiRequest(`/api/parties/${partyId}/leave`, { method: "POST" }),
    );
  }

  async function adminAction(action, values) {
    await refreshAfter(`${action}-${values.partyId || values.courtId}`, "Admin action completed.", () =>
      apiRequest("/api/admin", {
        method: "POST",
        body: JSON.stringify({ action, ...values }),
      }),
    );
  }

  async function logout() {
    setBusy("logout");
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
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

  const adminEnabled = Boolean(user?.isAdmin && adminMode);

  return (
    <main className="page">
      <header className="app-header">
        <div>
          <p className="eyebrow">Badminton Club</p>
          <h1>Court Queue</h1>
        </div>
        {user ? (
          <div className="session-actions">
            <span>{user.displayName}</span>
            {user.isAdmin ? (
              <label className="admin-toggle">
                <input
                  checked={adminMode}
                  onChange={(event) => setAdminMode(event.target.checked)}
                  type="checkbox"
                />
                Admin
              </label>
            ) : null}
            <button className="secondary-button" disabled={busy === "logout"} onClick={logout}>
              Sign out
            </button>
          </div>
        ) : null}
      </header>

      {!user ? (
        <section className="sign-in-panel">
          <h2>Sign in</h2>
          <p>Use your UC San Diego Google account.</p>
          {googleClientId ? <div ref={googleButtonRef} /> : <p>Google sign-in is not configured.</p>}
        </section>
      ) : (
        <>
          <nav className="gym-tabs" aria-label="Gym">
            {["MAIN", "REC"].map((gymName) => (
              <button
                className={gym === gymName ? "selected" : ""}
                key={gymName}
                onClick={() => setGym(gymName)}
                type="button"
              >
                {gymName === "MAIN" ? "Main Gym" : "Rec Gym"}
              </button>
            ))}
          </nav>

          <section className="status" aria-live="polite">
            {loading ? <p>Loading courts...</p> : null}
            {notice ? <p className="notice">{notice}</p> : null}
            {error ? <p className="error">{error}</p> : null}
          </section>

          <section className="grid">
            {courts.map((court) => {
              const shownPartyIds = new Set([
                court.activeParty?.id,
                ...court.queuedParties.map((party) => party.id),
              ]);
              const hiddenUserParty =
                court.userParty && !shownPartyIds.has(court.userParty.id)
                  ? court.userParty
                  : null;

              return (
                <article className="court-card" key={court.id}>
                  <div className="court-head">
                    <div>
                      <h2>Court {court.number}</h2>
                      <p>{formatCountdown(court.lastRotatedAt, court.rotationMinutes)}</p>
                    </div>
                    <span className={`badge ${court.paused ? "paused" : "active"}`}>
                      {court.paused ? "Paused" : "Running"}
                    </span>
                  </div>

                  <section className="court-section">
                    <div className="section-title">
                      <h3>Playing</h3>
                      <span>{court.activeParty ? `${4 - court.activeOpenSlots}/4` : "Open"}</span>
                    </div>
                    {court.activeParty ? (
                      <PartyMembers
                        adminEnabled={adminEnabled}
                        busy={busy}
                        onAdminRemove={(member) =>
                          adminAction("remove_party_member", {
                            partyId: court.activeParty.id,
                            userId: member.userId,
                          })
                        }
                        party={court.activeParty}
                      />
                    ) : (
                      <p className="empty-state">No active party</p>
                    )}
                    {court.canJoinActiveCourt ? (
                      <button
                        disabled={busy === `active-${court.id}`}
                        onClick={() => joinActive(court)}
                      >
                        Join active court
                      </button>
                    ) : null}
                    {court.activeParty?.canLeave ? (
                      <button
                        className="secondary-button"
                        disabled={busy === `leave-${court.activeParty.id}`}
                        onClick={() => leaveParty(court.activeParty.id)}
                      >
                        Leave active court
                      </button>
                    ) : null}
                    {adminEnabled && court.activeParty ? (
                      <button
                        className="danger-button"
                        onClick={() =>
                          adminAction("clear_active_court", {
                            partyId: court.activeParty.id,
                          })
                        }
                      >
                        Clear active party
                      </button>
                    ) : null}
                  </section>

                  <section className="court-section">
                    <div className="section-title">
                      <h3>Queue</h3>
                      <span>Top 5</span>
                    </div>
                    {court.queuedParties.length ? (
                      <div className="party-list">
                        {court.queuedParties.map((party) => (
                          <div className="party-row" key={party.id}>
                            <div className="party-heading">
                              <strong>Party {party.position}</strong>
                              <span>{party.members.length}/4</span>
                            </div>
                            <PartyMembers
                              adminEnabled={adminEnabled}
                              busy={busy}
                              onAdminRemove={(member) =>
                                adminAction("remove_party_member", {
                                  partyId: party.id,
                                  userId: member.userId,
                                })
                              }
                              party={party}
                            />
                            <div className="row-actions">
                              {party.canJoinParty || party.canSwitchToParty ? (
                                <button
                                  disabled={busy === `join-${party.id}`}
                                  onClick={() => joinParty(party)}
                                >
                                  {party.canSwitchToParty ? "Switch here" : "Join party"}
                                </button>
                              ) : null}
                              {party.canLeave ? (
                                <button
                                  className="secondary-button"
                                  disabled={busy === `leave-${party.id}`}
                                  onClick={() => leaveParty(party.id)}
                                >
                                  Leave
                                </button>
                              ) : null}
                              {adminEnabled && party.canCancel ? (
                                <button
                                  className="danger-button"
                                  onClick={() =>
                                    adminAction("cancel_queued_party", { partyId: party.id })
                                  }
                                >
                                  Delete party
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-state">No parties waiting</p>
                    )}

                    {hiddenUserParty ? (
                      <div className="your-party">
                        <span>Your party is position {hiddenUserParty.position}</span>
                        <button
                          className="secondary-button"
                          onClick={() => leaveParty(hiddenUserParty.id)}
                        >
                          Leave
                        </button>
                      </div>
                    ) : null}

                    {court.canJoinNewParty || court.canSwitchToNewParty ? (
                      <button
                        disabled={busy === `create-${court.id}`}
                        onClick={() => createParty(court)}
                      >
                        {court.canSwitchToNewParty ? "Switch to new party" : "Join end of queue"}
                      </button>
                    ) : null}
                  </section>

                  {adminEnabled ? (
                    <div className="admin-actions">
                      <button
                        disabled={busy === `rotate-${court.id}`}
                        onClick={() => adminAction("rotate", { courtId: court.id })}
                      >
                        Rotate now
                      </button>
                      <button
                        className="secondary-button"
                        disabled={busy === `toggle_pause-${court.id}`}
                        onClick={() => adminAction("toggle_pause", { courtId: court.id })}
                      >
                        {court.paused ? "Resume" : "Pause"}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

function PartyMembers({ adminEnabled, busy, onAdminRemove, party }) {
  return (
    <ul className="member-list">
      {party.members.map((member) => (
        <li key={member.id}>
          <span>
            {member.displayName}
            {member.isCurrentUser ? " (you)" : ""}
          </span>
          {adminEnabled && member.canAdminRemove ? (
            <button
              className="text-button"
              disabled={busy === `remove_party_member-${party.id}`}
              onClick={() => onAdminRemove(member)}
              type="button"
            >
              Remove
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
