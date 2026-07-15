import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import api from '../lib/api';

function StatCard({ icon, value, label, subtext, color }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: color || 'var(--accent-gradient-soft)' }}>
        {icon}
      </div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      {subtext && <div className="stat-card-subtext">{subtext}</div>}
    </div>
  );
}

const SERVICE_TYPE_META = {
  service:         { label: 'Service',        icon: '🔧', color: 'rgba(59,130,246,0.15)',  accent: '#3b82f6' },
  wheel_alignment: { label: 'Wheel Alignment', icon: '⚙️',  color: 'rgba(16,185,129,0.15)', accent: '#10b981' },
  spare_parts:     { label: 'Spare Parts',     icon: '🔩', color: 'rgba(245,158,11,0.15)', accent: '#f59e0b' },
};

function SpendByTypeSection({ spendByTypeYear, year }) {
  const types = ['service', 'wheel_alignment', 'spare_parts'];
  const total = spendByTypeYear.reduce((s, r) => s + parseFloat(r.total), 0);
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <div className="card-header">
        <h3 className="card-title">📊 Spending by Category ({year})</h3>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Total: <strong style={{ color: 'var(--text-primary)' }}>Rs. {total.toLocaleString()}</strong>
        </span>
      </div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--spacing-md)' }}>
          {types.map(type => {
            const meta = SERVICE_TYPE_META[type];
            const row = spendByTypeYear.find(r => r.service_type === type);
            const typeTotal = row ? parseFloat(row.total) : 0;
            const count = row ? parseInt(row.count) : 0;
            const pct = total > 0 ? Math.round((typeTotal / total) * 100) : 0;
            return (
              <div key={type} style={{
                background: meta.color,
                border: `1px solid ${meta.accent}33`,
                borderRadius: 'var(--border-radius)',
                padding: 'var(--spacing-md)',
              }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{meta.icon}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{meta.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                  Rs. {typeTotal.toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {count} record{count !== 1 ? 's' : ''} · {pct}% of spend
                </div>
                {total > 0 && (
                  <div style={{ marginTop: 8, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: meta.accent, borderRadius: 2, transition: 'width 0.6s ease' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ReminderItem({ reminder }) {
  const urgencyColor = {
    high: 'var(--color-danger)',
    medium: 'var(--color-warning)',
    low: 'var(--color-success)',
  };

  const urgencyIcon = { high: '🔴', medium: '🟡', low: '🟢' };

  return (
    <div className={`reminder-card ${reminder.urgency}`}>
      <div className="reminder-icon">
        {reminder.type === 'date' ? '📅' : '🛣️'}
      </div>
      <div style={{ flex: 1 }}>
        <div className="reminder-title">
          {reminder.vehicleType === 'car' ? '🚗' : '🏍️'} {reminder.vehicleNickname}
        </div>
        <div className="reminder-subtitle">
          {reminder.type === 'date'
            ? `Service due: ${format(new Date(reminder.nextServiceDate), 'dd MMM yyyy')} (${
                reminder.daysUntil >= 0
                  ? `in ${reminder.daysUntil} days`
                  : `${Math.abs(reminder.daysUntil)} days overdue`
              })`
            : `Next service at ${reminder.nextServiceKm?.toLocaleString()} km (last service: ${reminder.lastOdometer?.toLocaleString()} km)`
          }
        </div>
      </div>
      <span style={{ fontSize: 18 }}>{urgencyIcon[reminder.urgency]}</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 8,
        padding: '8px 14px',
        fontSize: 13,
      }}>
        <div style={{ color: 'var(--text-secondary)', marginBottom: 4 }}>{label}</div>
        <div style={{ color: '#60a5fa', fontWeight: 700 }}>
          Rs. {Number(payload[0].value).toLocaleString()}
        </div>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const [year, setYear] = useState(new Date().getFullYear());

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboard', year],
    queryFn: () => api.get(`/dashboard`, { params: { year } }).then(r => r.data),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="page-content">
        <div className="loading-overlay" style={{ minHeight: 400 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <span className="empty-state-icon">⚠️</span>
          <div className="empty-state-title">Failed to load dashboard</div>
          <div className="empty-state-text">Check your connection and try again.</div>
        </div>
      </div>
    );
  }

  const { summary, vehicles, reminders, monthlySpend, spendByTypeYear, spendByType, availableYears = [] } = data;

  // Fill all 12 months for chart
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const chartData = monthNames.map((name, i) => {
    const found = monthlySpend?.find(m => m.month === i + 1);
    return { name, total: found ? parseFloat(found.total) : 0 };
  });

  const urgentReminders = reminders?.filter(r => r.urgency === 'high') || [];
  const allReminders = reminders || [];

  return (
    <div className="page-content fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your fleet and upcoming services</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          {availableYears.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label htmlFor="dashboard-year-select" style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>Filter Year:</label>
              <select
                id="dashboard-year-select"
                className="form-select"
                style={{ width: 120, height: 38, padding: '0 12px', background: 'var(--bg-card)', borderColor: 'var(--border-color)', borderRadius: 'var(--border-radius)', color: 'var(--text-primary)' }}
                value={year}
                onChange={e => setYear(parseInt(e.target.value))}
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          {urgentReminders.length > 0 && (
            <div className="badge badge-danger" style={{ fontSize: 13, padding: '6px 14px' }}>
              🔴 {urgentReminders.length} urgent reminder{urgentReminders.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <StatCard
          icon="🚗"
          value={summary.vehicleCount}
          label="Total Vehicles"
          subtext={
            spendByType && spendByType.length > 0
              ? spendByType
                  .map(r => `${SERVICE_TYPE_META[r.service_type]?.icon ?? ''} ${r.count} ${SERVICE_TYPE_META[r.service_type]?.label ?? r.service_type}`)
                  .join('  ·  ')
              : `${summary.serviceCount} records`
          }
          color="rgba(59,130,246,0.15)"
        />
        <StatCard
          icon="💰"
          value={`Rs. ${Number(summary.yearSpend).toLocaleString()}`}
          label={`Spent in ${year}`}
          subtext={`Rs. ${Number(summary.allTimeSpend).toLocaleString()} all time`}
          color="rgba(16,185,129,0.15)"
        />
        <StatCard
          icon="📅"
          value={summary.lastService
            ? format(new Date(summary.lastService.date), 'dd MMM yy')
            : '—'}
          label="Last Service"
          subtext={summary.lastService
            ? `${summary.lastService.vehicleNickname} · ${summary.daysSinceLastService} days ago`
            : 'No services yet'}
          color="rgba(245,158,11,0.15)"
        />
        <StatCard
          icon="🔔"
          value={allReminders.length}
          label="Active Reminders"
          subtext={urgentReminders.length > 0
            ? `${urgentReminders.length} high priority`
            : 'All on track'}
          color={urgentReminders.length > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)'}
        />
      </div>

      {/* Spending by Category */}
      {spendByTypeYear && spendByTypeYear.length > 0 && (
        <SpendByTypeSection spendByTypeYear={spendByTypeYear} year={year} />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)' }}>
        {/* Monthly Spend Chart */}
        <div className="card" style={{ gridColumn: window.innerWidth < 768 ? '1/-1' : undefined }}>
          <div className="card-header">
            <h3 className="card-title">📈 Monthly Spend ({year})</h3>
          </div>
          <div className="card-body">
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v > 0 ? `${(v/1000).toFixed(0)}k` : '0'}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="total"
                    fill="url(#barGradient)"
                    radius={[4, 4, 0, 0]}
                  />
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#06b6d4" />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Reminders */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🔔 Service Reminders</h3>
            {allReminders.length > 0 && (
              <span className="badge badge-warning">{allReminders.length}</span>
            )}
          </div>
          <div className="card-body" style={{ padding: allReminders.length === 0 ? undefined : 'var(--spacing-md)' }}>
            {allReminders.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--spacing-xl) 0' }}>
                <span className="empty-state-icon" style={{ fontSize: 36 }}>✅</span>
                <div className="empty-state-title" style={{ fontSize: 15 }}>All vehicles on track!</div>
                <div className="empty-state-text">No upcoming service reminders.</div>
              </div>
            ) : (
              allReminders.slice(0, 5).map((r, i) => (
                <ReminderItem key={i} reminder={r} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Vehicle Overview */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">🚗 Fleet Overview</h3>
          <Link to="/vehicles" className="btn btn-sm btn-secondary">
            Manage Vehicles →
          </Link>
        </div>
        {vehicles.length === 0 ? (
          <div className="card-body">
            <div className="empty-state" style={{ padding: 'var(--spacing-xl) 0' }}>
              <span className="empty-state-icon">🚘</span>
              <div className="empty-state-title">No vehicles yet</div>
              <div className="empty-state-text">Add your first vehicle to get started.</div>
              <Link to="/vehicles" className="btn btn-primary">
                + Add Vehicle
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Reg. No.</th>
                  <th>Last Service</th>
                  <th>Next Service</th>
                  <th>Total Spent</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map(v => {
                  const hasReminder = allReminders.some(r => r.vehicleId === v.id && r.urgency === 'high');
                  const hasMedium = allReminders.some(r => r.vehicleId === v.id && r.urgency === 'medium');
                  return (
                    <tr key={v.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/vehicles/${v.id}`}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{v.type === 'car' ? '🚗' : '🏍️'}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14 }}>
                              {v.nickname}
                            </div>
                            {v.make && (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                {v.make} {v.model} {v.year || ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <code style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {v.registration_number || '—'}
                        </code>
                      </td>
                      <td>
                        {v.last_service_date
                          ? format(new Date(v.last_service_date), 'dd MMM yyyy')
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {v.next_service_date
                          ? format(new Date(v.next_service_date), 'dd MMM yyyy')
                          : v.next_service_km
                            ? `${Number(v.next_service_km).toLocaleString()} km`
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        Rs. {Number(v.total_spent || 0).toLocaleString()}
                      </td>
                      <td>
                        {hasReminder
                          ? <span className="badge badge-danger">⚠️ Due Soon</span>
                          : hasMedium
                            ? <span className="badge badge-warning">📅 Upcoming</span>
                            : <span className="badge badge-success">✅ OK</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
