"use client";

import { useEffect, useState } from "react";

const emptyJoinForm = {
  name: "",
  courtId: "",
};

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
  const [courts, setCourts] = useState([]);
  const [joinForm, setJoinForm] = useState(emptyJoinForm);
  const [adminPasscode, setAdminPasscode] = useState("");
  const [dummyNames, setDummyNames] = useState({});
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  async function loadCourts() {
    const data = await apiRequest("/api/courts");
    setCourts(data.courts);
  }

  useEffect(() => {
    loadCourts()
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleJoin(event) {
    event.preventDefault();
    setBusy("join");
    setNotice("");
    setError("");

    try {
      await apiRequest("/api/join", {
        method: "POST",
        body: JSON.stringify(joinForm),
      });
      setJoinForm(emptyJoinForm);
      setNotice("Joined queue.");
      await loadCourts();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy("");
    }
  }

  async function handleLeave(courtId, playerId) {
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
    setBusy(`${action}-${courtId}`);
    setNotice("");
    setError("");

    try {
      await apiRequest("/api/admin", {
        method: "POST",
        body: JSON.stringify({
          courtId,
          action,
          adminPasscode,
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

  return (
    <main className="page">
      <section className="hero">
        <div>
          <p className="eyebrow">Badminton Club</p>
          <h1>Court Queue</h1>
          <p className="copy">
            Enter a name, pick a court, and join. Admins can rotate courts and
            add dummy players with a passcode.
          </p>
        </div>

        <form className="card form-card" onSubmit={handleJoin}>
          <h2>Join Queue</h2>
          <label>
            <span>Name</span>
            <input
              onChange={(event) =>
                setJoinForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="Wyatt"
              required
              value={joinForm.name}
            />
          </label>
          <label>
            <span>Court</span>
            <select
              onChange={(event) =>
                setJoinForm((current) => ({ ...current, courtId: event.target.value }))
              }
              required
              value={joinForm.courtId}
            >
              <option value="">Select a court</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  Court {court.number}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy === "join"} type="submit">
            {busy === "join" ? "Joining..." : "Join"}
          </button>
        </form>
      </section>

      <section className="status">
        {loading ? <p>Loading courts...</p> : null}
        {notice ? <p className="notice">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="admin card">
        <h2>Admin</h2>
        <label>
          <span>Passcode</span>
          <input
            onChange={(event) => setAdminPasscode(event.target.value)}
            placeholder="Admin passcode"
            type="password"
            value={adminPasscode}
          />
        </label>
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
              <ul>
                {court.queue.length ? (
                  court.queue.map((player) => (
                    <li className="queue-row" key={player.id}>
                      <span>{player.name}</span>
                      <button
                        disabled={busy === `leave-${player.id}`}
                        onClick={() => handleLeave(court.id, player.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    </li>
                  ))
                ) : (
                  <li>No one waiting</li>
                )}
              </ul>
            </div>

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
          </article>
        ))}
      </section>
    </main>
  );
}

