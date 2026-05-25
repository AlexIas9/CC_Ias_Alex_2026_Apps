import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "react-oidc-context";
import { API_BASE, COGNITO_DOMAIN, LOGOUT_URI, OIDC_CONFIG } from "./config";
import "./App.css";

const STATUS_LABELS = {
  normal: "Normal",
  warning: "Warning",
  critical: "Critical",
  unknown: "Unknown",
};

const STATUS_OPTIONS = ["all", "normal", "warning", "critical"];
const TABLE_LIMIT = 100;
const STATUS_META = {
  normal: { label: "Normal", color: "#41d69a" },
  warning: { label: "Warning", color: "#f7c948" },
  critical: { label: "Critical", color: "#ff5c7c" },
  unknown: { label: "Unknown", color: "#94a3b8" },
};

function formatEventType(eventType = "") {
  return eventType.replace(/_/g, " ");
}

function formatStatus(status = "") {
  return STATUS_LABELS[status] || status || "Unknown";
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return "Unknown";
  }

  return timestamp.replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
}

function formatNumber(value, options = {}) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
    ...options,
  });
}

function formatPercent(value, total) {
  if (!total) {
    return "0%";
  }

  return `${formatNumber((value / total) * 100, { maximumFractionDigits: 1 })}%`;
}

function getTooltipPosition(event) {
  const panel = event.currentTarget.closest(".chart-panel") || event.currentTarget;
  const bounds = panel.getBoundingClientRect();

  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function formatShortTimestamp(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function buildTotalsByDevice(events) {
  const totals = events.reduce((acc, event) => {
    acc[event.device_id] = (acc[event.device_id] || 0) + Number(event.value || 0);
    return acc;
  }, {});

  return Object.entries(totals)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

function buildStatusChartItems(events) {
  const counts = getStatusCounts(events);

  return Object.entries(counts)
    .filter(([, value]) => value > 0)
    .map(([label, value]) => ({
      label,
      value,
      color: STATUS_META[label]?.color || STATUS_META.unknown.color,
    }));
}

function buildEnergyTimeline(events, maxPoints = 28) {
  const orderedEvents = [...events]
    .filter((event) => event.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (orderedEvents.length === 0) {
    return [];
  }

  const chunkSize = Math.max(1, Math.ceil(orderedEvents.length / maxPoints));
  const points = [];

  for (let index = 0; index < orderedEvents.length; index += chunkSize) {
    const chunk = orderedEvents.slice(index, index + chunkSize);
    const value = chunk.reduce((sum, event) => sum + Number(event.value || 0), 0);
    const lastEvent = chunk[chunk.length - 1];

    points.push({
      label: formatShortTimestamp(lastEvent.timestamp),
      fullLabel: formatTimestamp(lastEvent.timestamp),
      value,
    });
  }

  return points;
}

function buildSmoothPath(points) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    return `M ${point.x} ${point.y}`;
  }

  return points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }

    const previous = points[index - 1];
    const controlX = (previous.x + point.x) / 2;

    return `${path} C ${controlX} ${previous.y}, ${controlX} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function getStatusCounts(events) {
  return events.reduce(
    (counts, event) => {
      const status = event.status || "unknown";
      counts[status] = (counts[status] || 0) + 1;
      return counts;
    },
    { normal: 0, warning: 0, critical: 0 }
  );
}

function KpiCard({ label, value, meta, tone = "default" }) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <span className="kpi-label">{label}</span>
      <strong>{value}</strong>
      {meta && <small>{meta}</small>}
    </article>
  );
}

function ChartHeader({ title, eyebrow }) {
  return (
    <div className="section-title-row">
      <div>
        {eyebrow && <p className="mini-eyebrow">{eyebrow}</p>}
        <h3>{title}</h3>
      </div>
    </div>
  );
}

function ChartTooltip({ tooltip }) {
  if (!tooltip) {
    return null;
  }

  return (
    <div className="chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
      <strong>{tooltip.title}</strong>
      {tooltip.subtitle && <span>{tooltip.subtitle}</span>}
      {tooltip.rows && (
        <div className="tooltip-rows">
          {tooltip.rows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <b>{row.value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SimpleBarChart({ title, items, labelFormatter = (label) => label, valueFormatter }) {
  const [tooltip, setTooltip] = useState(null);
  const maxValue = Math.max(...items.map((item) => item.value), 0);

  return (
    <section className="glass-card chart-panel" onMouseLeave={() => setTooltip(null)}>
      <ChartHeader title={title} eyebrow="Device totals" />
      {items.length === 0 ? (
        <p className="muted">No events to chart.</p>
      ) : (
        <div className="bar-chart chart-scroll-area">
          {items.map((item, index) => {
            const width = maxValue > 0 ? `${Math.max((item.value / maxValue) * 100, 7)}%` : "0%";
            const displayValue = valueFormatter ? valueFormatter(item.value) : item.value;

            return (
              <div
                className="bar-row"
                key={item.label}
                onMouseMove={(event) =>
                  setTooltip({
                    ...getTooltipPosition(event),
                    title: labelFormatter(item.label),
                    rows: [{ label: "Total value", value: displayValue }],
                  })
                }
              >
                <div className="bar-label">{labelFormatter(item.label)}</div>
                <div className="bar-track" aria-hidden="true">
                  <span className={`bar-fill bar-fill-${index % 5}`} style={{ width }} />
                </div>
                <div className="bar-value">{displayValue}</div>
              </div>
            );
          })}
        </div>
      )}
      <ChartTooltip tooltip={tooltip} />
    </section>
  );
}

function DonutChart({ title, items }) {
  const [tooltip, setTooltip] = useState(null);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  let cursor = 0;
  const gradient = items
    .map((item) => {
      const start = total > 0 ? (cursor / total) * 100 : 0;
      cursor += item.value;
      const end = total > 0 ? (cursor / total) * 100 : 0;
      return `${item.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <section className="glass-card chart-panel donut-panel" onMouseLeave={() => setTooltip(null)}>
      <ChartHeader title={title} eyebrow="Health mix" />
      {total === 0 ? (
        <p className="muted">No events to chart.</p>
      ) : (
        <div className="donut-layout">
          <div
            className="donut-chart"
            style={{ background: `conic-gradient(${gradient})` }}
            aria-label={`${title}: ${total} events`}
            onMouseMove={(event) =>
              setTooltip({
                ...getTooltipPosition(event),
                title,
                subtitle: `${formatNumber(total)} total events`,
                rows: items.map((item) => ({
                  label: formatStatus(item.label),
                  value: `${formatNumber(item.value)} (${formatPercent(item.value, total)})`,
                })),
              })
            }
          >
            <div>
              <strong>{formatNumber(total)}</strong>
              <span>events</span>
            </div>
          </div>
          <div className="donut-legend">
            {items.map((item) => (
              <div
                className="legend-row"
                key={item.label}
                onMouseMove={(event) =>
                  setTooltip({
                    ...getTooltipPosition(event),
                    title: formatStatus(item.label),
                    rows: [
                      { label: "Events", value: formatNumber(item.value) },
                      { label: "Share", value: formatPercent(item.value, total) },
                    ],
                  })
                }
              >
                <span className="legend-dot" style={{ backgroundColor: item.color }} />
                <span>{formatStatus(item.label)}</span>
                <strong>{formatNumber(item.value)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
      <ChartTooltip tooltip={tooltip} />
    </section>
  );
}

function LineChart({ title, points }) {
  const [tooltip, setTooltip] = useState(null);
  const width = 720;
  const height = 260;
  const paddingX = 34;
  const paddingY = 28;
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0);
  const range = Math.max(maxValue - minValue, 1);
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const coordinates = points.map((point, index) => {
    const x = paddingX + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
    const y = paddingY + chartHeight - ((point.value - minValue) / range) * chartHeight;
    return { ...point, x, y };
  });
  const linePath = buildSmoothPath(coordinates);
  const areaPoints =
    coordinates.length > 0
      ? `${paddingX},${height - paddingY} ${coordinates.map((point) => `${point.x},${point.y}`).join(" ")} ${
          width - paddingX
        },${height - paddingY}`
      : "";
  const firstLabel = coordinates[0]?.label;
  const middleLabel = coordinates[Math.floor(coordinates.length / 2)]?.label;
  const lastLabel = coordinates[coordinates.length - 1]?.label;
  const peakPoint = coordinates.reduce((peak, point) => (point.value > peak.value ? point : peak), coordinates[0]);

  return (
    <section className="glass-card chart-panel line-panel" onMouseLeave={() => setTooltip(null)}>
      <div className="chart-heading-row">
        <ChartHeader title={title} eyebrow="Trend" />
        {peakPoint && (
          <div className="chart-chip">
            <span>Peak</span>
            <strong>{formatNumber(peakPoint.value)}</strong>
          </div>
        )}
      </div>
      {points.length === 0 ? (
        <p className="muted">No events to chart.</p>
      ) : (
        <>
          <div className="line-chart-wrap">
            <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
              <defs>
                <linearGradient id="energyLineGradient" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#41d69a" />
                  <stop offset="55%" stopColor="#67a8ff" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
                <linearGradient id="energyAreaGradient" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#38d7c2" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#38d7c2" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((ratio) => {
                const y = paddingY + chartHeight * ratio;
                return <line className="grid-line" key={ratio} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
              })}
              <line x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} />
              <line x1={paddingX} x2={paddingX} y1={paddingY} y2={height - paddingY} />
              <polygon points={areaPoints} />
              <path d={linePath} />
              {coordinates.map((point, index) => (
                <g
                  className="line-point"
                  key={`${point.label}-${index}`}
                  onMouseMove={(event) =>
                    setTooltip({
                      ...getTooltipPosition(event),
                      title: point.fullLabel,
                      rows: [{ label: "Energy value", value: formatNumber(point.value) }],
                    })
                  }
                >
                  <circle
                    className={point === peakPoint ? "peak-point" : ""}
                    cx={point.x}
                    cy={point.y}
                    r={point === peakPoint ? "4.5" : "2.5"}
                  />
                  <circle className="hit-point" cx={point.x} cy={point.y} r="10" />
                </g>
              ))}
            </svg>
          </div>
          <div className="axis-labels">
            <span>{firstLabel}</span>
            <span>{middleLabel}</span>
            <span>{lastLabel}</span>
          </div>
        </>
      )}
      <ChartTooltip tooltip={tooltip} />
    </section>
  );
}

function DashboardTable({ events, totalCount }) {
  return (
    <section className="glass-card table-card">
      <div className="section-title-row">
        <div>
          <h3>Event Stream</h3>
          <p className="muted">
            Showing {events.length} of {totalCount} matching events
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="events-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Device</th>
              <th>Timestamp</th>
              <th>Event</th>
              <th>Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan="6" className="empty-cell">
                  No events match the current filters.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={event.id}>
                  <td>{event.id}</td>
                  <td>{event.device_id}</td>
                  <td>{formatTimestamp(event.timestamp)}</td>
                  <td>{formatEventType(event.event_type)}</td>
                  <td>{formatNumber(event.value)}</td>
                  <td>
                    <span className={`status-pill status-${event.status}`}>
                      {formatStatus(event.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DebugPanel({ title, data }) {
  return (
    <details className="debug-panel">
      <summary>{title}</summary>
      <pre className="code-block">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

function ProfileCard({ profile, loading, deviceLabel }) {
  return (
    <section className="glass-card profile-card">
      <ChartHeader title="User Profile API Response" eyebrow="Identity" />
      {loading ? (
        <p className="muted">Loading profile...</p>
      ) : profile ? (
        <>
          <div className="detail-list">
            <div>
              <span>Role</span>
              <strong>{profile.role || "unknown"}</strong>
            </div>
            <div>
              <span>Device</span>
              <strong>{deviceLabel}</strong>
            </div>
          </div>
          <DebugPanel title="Debug JSON" data={profile} />
        </>
      ) : (
        <p className="muted">No profile loaded yet.</p>
      )}
    </section>
  );
}

function DataResponseCard({ dataResponse, events, loading, deviceLabel }) {
  return (
    <section className="glass-card profile-card">
      <ChartHeader title="Data API Response" eyebrow="Azure Functions" />
      {loading ? (
        <p className="muted">Loading data...</p>
      ) : dataResponse ? (
        <div className="detail-list">
          <div>
            <span>Records</span>
            <strong>{formatNumber(events.length)}</strong>
          </div>
          <div>
            <span>Scope</span>
            <strong>{deviceLabel}</strong>
          </div>
        </div>
      ) : (
        <p className="muted">No data loaded yet.</p>
      )}
    </section>
  );
}

function TokenCard({ idToken, copied, onCopy }) {
  const [showToken, setShowToken] = useState(false);

  return (
    <section className="glass-card token-card">
      <div className="section-title-row">
        <div>
          <h3>Authentication Token</h3>
          <p className="muted">Hidden by default for presentation mode</p>
        </div>
        <div className="actions">
          <button className="btn btn-small btn-ghost" onClick={() => setShowToken((current) => !current)}>
            {showToken ? "Hide token" : "Show token"}
          </button>
          <button className="btn btn-small btn-ghost" onClick={onCopy}>
            {copied ? "Copied" : "Copy token"}
          </button>
        </div>
      </div>
      {showToken && <pre className="code-block token-block">{idToken}</pre>}
    </section>
  );
}

function SignedOutView({ onSignIn }) {
  return (
    <section className="login-stage">
      <div className="login-copy">
        <span className="app-mark">CC</span>
        <p className="mini-eyebrow">Secure cloud access</p>
        <h2>Open the dashboard</h2>
        <p>
          Amazon Cognito handles authentication before Azure Functions returns the device telemetry
          dashboard.
        </p>
        <div className="login-actions">
          <button className="btn btn-large" onClick={onSignIn}>
            Sign in with Cognito
          </button>
        </div>
      </div>

      <div className="login-panel glass-card">
        <div className="login-panel-head">
          <span className="session-dot" />
          <div>
            <h3>Protected Session</h3>
            <p className="muted">Waiting for a Cognito user token</p>
          </div>
        </div>

        <div className="cloud-stack">
          <div className="stack-row">
            <span>Identity</span>
            <strong>Amazon Cognito</strong>
          </div>
          <div className="stack-row">
            <span>API</span>
            <strong>Azure Functions</strong>
          </div>
          <div className="stack-row">
            <span>Dataset</span>
            <strong>Azure Blob Storage</strong>
          </div>
        </div>

        <div className="login-preview">
          <div className="preview-line preview-line-wide" />
          <div className="preview-grid">
            <span />
            <span />
            <span />
          </div>
          <div className="preview-chart">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
    </section>
  );
}

function Dashboard({
  dataResponse,
  events,
  isAdmin,
  loadingData,
  profile,
  loadingProfile,
  idToken,
  copied,
  onCopyToken,
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const role = dataResponse?.role || profile?.role || "unknown";
  const deviceLabel = isAdmin ? "all devices" : dataResponse?.device_id || profile?.device_id || "assigned device";

  const filteredEvents = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return events.filter((event) => {
      const matchesSearch =
        normalizedSearch === "" ||
        event.device_id?.toLowerCase().includes(normalizedSearch) ||
        event.status?.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || event.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [events, search, statusFilter]);

  const visibleEvents = filteredEvents.slice(0, TABLE_LIMIT);
  const statusCounts = getStatusCounts(events);
  const totalValue = events.reduce((sum, event) => sum + Number(event.value || 0), 0);
  const averageValue = events.length > 0 ? totalValue / events.length : 0;
  const totalValueByDevice = buildTotalsByDevice(filteredEvents);
  const eventsByStatus = buildStatusChartItems(filteredEvents);
  const energyTimeline = buildEnergyTimeline(filteredEvents);

  return (
    <>
      <section className={`dashboard-hero ${isAdmin ? "admin-hero" : "user-hero"}`}>
        <div>
          <p className="eyebrow">{isAdmin ? "Admin Control Plane" : "My Device Dashboard"}</p>
          <h2>{isAdmin ? "Fleet Observability Dashboard" : "My Device Dashboard"}</h2>
          <p>
            {isAdmin
              ? "Monitor every device, status signal, and energy usage event across the dataset."
              : `Focused telemetry for ${deviceLabel}, filtered by your Cognito identity.`}
          </p>
        </div>
        <div className="hero-stat">
          <span>Scope</span>
          <strong>{deviceLabel}</strong>
        </div>
      </section>

      <section className="kpi-grid">
        <KpiCard label="Events" value={formatNumber(events.length)} meta="loaded from Azure Blob Storage" />
        <KpiCard label="Total Value" value={formatNumber(totalValue)} />
        <KpiCard label="Average Value" value={formatNumber(averageValue)} />
        <KpiCard label="Normal" value={formatNumber(statusCounts.normal)} tone="normal" />
        <KpiCard label="Warning" value={formatNumber(statusCounts.warning)} tone="warning" />
        <KpiCard label="Critical" value={formatNumber(statusCounts.critical)} tone="critical" />
      </section>

      <section className="dashboard-grid">
        <ProfileCard profile={profile} loading={loadingProfile} deviceLabel={deviceLabel} />
        <DataResponseCard
          dataResponse={dataResponse}
          events={events}
          loading={loadingData}
          deviceLabel={deviceLabel}
        />
        <TokenCard idToken={idToken} copied={copied} onCopy={onCopyToken} />
      </section>

      <section className="glass-card filters-card">
        <div>
          <h3>Filters</h3>
          <p className="muted">
            {isAdmin
              ? "Search by device or status across the fleet."
              : "Filter the events available for your device."}
          </p>
        </div>
        <div className="filter-controls">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={isAdmin ? "Search device_id or status" : "Search my events"}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : formatStatus(status)}
              </option>
            ))}
          </select>
        </div>
      </section>

      {loadingData ? (
        <section className="glass-card loading-card">
          <p className="muted">Loading data from Azure Functions...</p>
        </section>
      ) : (
        <>
          <div className="charts-grid">
            <SimpleBarChart
              title="Total Value by Device"
              items={totalValueByDevice}
              valueFormatter={(value) => formatNumber(value)}
            />
            <DonutChart title="Events by Status" items={eventsByStatus} />
          </div>
          <LineChart title="Energy Usage Over Time" points={energyTimeline} />
          <DashboardTable events={visibleEvents} totalCount={filteredEvents.length} />
        </>
      )}
    </>
  );
}

function App() {
  const auth = useAuth();

  const [profile, setProfile] = useState(null);
  const [dataResponse, setDataResponse] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const idToken = auth.user?.id_token;
  const events = Array.isArray(dataResponse?.data) ? dataResponse.data : [];
  const role = dataResponse?.role || profile?.role || "unknown";
  const isAdmin = role === "admin";

  useEffect(() => {
    if (!idToken) {
      setProfile(null);
      setDataResponse(null);
      return;
    }

    setError(null);

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

    auth.removeUser();

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
      <main className="app">
        <header className="top-header glass-card">
          <div className="title-block">
            <h1>Cloud Computing App</h1>
            <p>Secure frontend with Amazon Cognito authentication and Azure Functions APIs</p>
          </div>

          {auth.isAuthenticated ? (
            <div className="identity-panel">
              <span className="user-email">{auth.user?.profile?.email || "(no email claim)"}</span>
              <span className={`role-badge role-${role}`}>{role}</span>
              <button className="btn btn-secondary" onClick={signOutRedirect}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="identity-panel">
              <span className="session-pill">Protected access</span>
            </div>
          )}
        </header>

        {error && (
          <div className="alert">
            <strong>Error:</strong> {error}
          </div>
        )}

        {auth.isAuthenticated ? (
          <Dashboard
            dataResponse={dataResponse}
            events={events}
            isAdmin={isAdmin}
            loadingData={loadingData}
            profile={profile}
            loadingProfile={loadingProfile}
            idToken={idToken}
            copied={copied}
            onCopyToken={copyToken}
          />
        ) : (
          <SignedOutView onSignIn={() => auth.signinRedirect()} />
        )}
      </main>
    </div>
  );
}

export default App;
