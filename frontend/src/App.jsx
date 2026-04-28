import React, { useEffect, useState } from "react";
import { useAuth } from "react-oidc-context";
import { API_BASE, COGNITO_DOMAIN, LOGOUT_URI, OIDC_CONFIG } from "./config";
import "./App.css";

const STATUS_LABELS = {
  normal: "Normal",
  warning: "Warning",
  critical: "Critical",
};

function formatEventType(eventType) {
  return eventType.replace(/_/g, " ");
}

function formatStatus(status) {
  return STATUS_LABELS[status] || status;
}

function formatTimestamp(timestamp) {
  return timestamp.replace("T", " ").replace("Z", " UTC");
}

function buildTotalsByDevice(events) {
  const totals = events.reduce((acc, event) => {
    acc[event.device_id] = (acc[event.device_id] || 0) + event.value;
    return acc;
  }, {});

  return Object.entries(totals).map(([label, value]) => ({ label, value }));
}

function buildCounts(events, field) {
  const counts = events.reduce((acc, event) => {
    const key = event[field];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).map(([label, value]) => ({ label, value }));
}

function SimpleBarChart({ title, items, labelFormatter = (label) => label, valueFormatter }) {
  const maxValue = Math.max(...items.map((item) => item.value), 0);

  return (
    <div className="chart-panel">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">No events to chart.</p>
      ) : (
        <div className="bar-chart">
          {items.map((item, index) => {
            const width = maxValue > 0 ? `${Math.max((item.value / maxValue) * 100, 6)}%` : "0%";
            const displayValue = valueFormatter ? valueFormatter(item.value) : item.value;

            return (
              <div className="bar-row" key={item.label}>
                <div className="bar-label">{labelFormatter(item.label)}</div>
                <div className="bar-track">
                  <span className={`bar-fill bar-fill-${index % 4}`} style={{ width }} />
                </div>
                <div className="bar-value">{displayValue}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function App() {
  const auth = useAuth();

  const [profile, setProfile] = useState(null);
  const [dataResponse, setDataResponse] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);

  const idToken = auth.user?.id_token;
  const events = Array.isArray(dataResponse?.data) ? dataResponse.data : [];
  const totalValueByDevice = buildTotalsByDevice(events);
  const eventsByStatus = buildCounts(events, "status");

  // Call backend when we have an idToken
  useEffect(() => {
    if (!idToken) {
      setProfile(null);
      setDataResponse(null);
      return;
    }

    setError(null);

    // /api/profile
    setLoadingProfile(true);
    fetch(`${API_BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error calling /api/profile");
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingProfile(false));

    // /api/data
    setLoadingData(true);
    fetch(`${API_BASE}/api/data`, {
      headers: { Authorization: `Bearer ${idToken}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Error calling /api/data");
        return res.json();
      })
      .then((data) => setDataResponse(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingData(false));
  }, [idToken]);

  const signOutRedirect = () => {
    const clientId = OIDC_CONFIG.client_id;
    const logoutUri = LOGOUT_URI;
    const cognitoDomain = COGNITO_DOMAIN;

    // Clear local OIDC user (react-oidc-context)
    auth.removeUser();

    // Redirect to Cognito logout endpoint
    window.location.href =
      `${cognitoDomain}/logout?client_id=${clientId}` +
      `&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  const copyToken = async () => {
    if (!idToken) return;
    try {
      await navigator.clipboard.writeText(idToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (copyError) {
      setError("Unable to copy token to clipboard.");
    }
  };

  if (auth.isLoading) {
    return (
      <div className="app-shell">
        <div className="status-panel">Loading authentication...</div>
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="app-shell">
        <div className="status-panel status-panel-error">
          Encountering error... {auth.error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="bg-orb bg-orb-left" />
      <div className="bg-orb bg-orb-right" />
      <main className="app">
        <header className="hero">
          <p className="hero-kicker">Identity + Serverless</p>
          <h1>Cloud Computing App</h1>
          <p className="hero-subtitle">
            Secure frontend with Amazon Cognito authentication and Azure Functions APIs.
          </p>
        </header>

        {error && (
          <div className="alert">
            <strong>Error:</strong> {error}
          </div>
        )}

        <section className="card status-card">
          {auth.isAuthenticated ? (
            <>
              <p className="status-line">
                <span className="status-dot status-dot-online" />
                Logged in as <strong>{auth.user?.profile?.email || "(no email claim)"}</strong>
              </p>
              <button className="btn btn-secondary" onClick={signOutRedirect}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="status-line">
                <span className="status-dot" />
                Not logged in
              </p>
              <button className="btn" onClick={() => auth.signinRedirect()}>
                Sign in
              </button>
            </>
          )}
        </section>

        {auth.isAuthenticated && (
          <div className="grid">
            <section className="card">
              <div className="section-head">
                <h2>Authentication Token</h2>
                <div className="actions">
                  <button
                    className="btn btn-small btn-ghost"
                    onClick={() => setShowToken((current) => !current)}
                  >
                    {showToken ? "Hide" : "Show"}
                  </button>
                  <button className="btn btn-small btn-ghost" onClick={copyToken}>
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <pre className="code-block">
                ID Token: {showToken ? auth.user?.id_token : "********************"}
              </pre>
            </section>

            <section className="card">
              <h2>User Profile API Response</h2>
              {loadingProfile ? (
                <p className="muted">Loading profile...</p>
              ) : profile ? (
                <pre className="code-block">{JSON.stringify(profile, null, 2)}</pre>
              ) : (
                <p className="muted">No profile loaded yet.</p>
              )}
            </section>

            <section className="card card-wide">
              <h2>Data API Response</h2>
              {loadingData ? (
                <p className="muted">Loading data...</p>
              ) : dataResponse ? (
                <>
                  <p className="data-meta">
                    Role: <strong>{dataResponse.role}</strong>
                    <span>Device: {dataResponse.device_id || "all devices"}</span>
                    <span>Events: {events.length}</span>
                  </p>

                  <div className="charts-grid">
                    <SimpleBarChart
                      title="Total Value by Device"
                      items={totalValueByDevice}
                      valueFormatter={(value) => value.toLocaleString()}
                    />
                    <SimpleBarChart
                      title="Events by Status"
                      items={eventsByStatus}
                      labelFormatter={formatStatus}
                      valueFormatter={(value) => `${value} event${value === 1 ? "" : "s"}`}
                    />
                  </div>

                  <div className="table-wrap">
                    <table className="events-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Device ID</th>
                          <th>Timestamp</th>
                          <th>Event Type</th>
                          <th>Value</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((event) => (
                          <tr key={event.id}>
                            <td>{event.id}</td>
                            <td>{event.device_id}</td>
                            <td>{formatTimestamp(event.timestamp)}</td>
                            <td>{formatEventType(event.event_type)}</td>
                            <td>{event.value}</td>
                            <td>
                              <span className={`status-pill status-${event.status}`}>
                                {formatStatus(event.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="muted">No data loaded yet.</p>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
