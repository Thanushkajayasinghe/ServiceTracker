import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import api from '../lib/api';

export default function Parts() {
  const [search, setSearch] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [page, setPage] = useState(1);
  const [accumulatedParts, setAccumulatedParts] = useState([]);

  // Fetch all user vehicles for filter dropdown
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get('/vehicles').then(r => r.data),
  });

  // Fetch parts (service items) with active search/vehicle filters and page
  const { data: response, isLoading, isFetching, isError } = useQuery({
    queryKey: ['parts', search, selectedVehicleId, page],
    queryFn: () => api.get('/parts', {
      params: { search: search || undefined, vehicleId: selectedVehicleId || undefined, page, limit: 15 }
    }).then(r => r.data),
    keepPreviousData: true,
  });

  // Reset accumulated list when filters change
  useEffect(() => {
    setPage(1);
    setAccumulatedParts([]);
  }, [search, selectedVehicleId]);

  // Append new page data to accumulated list
  useEffect(() => {
    if (response?.data) {
      if (page === 1) {
        setAccumulatedParts(response.data);
      } else {
        setAccumulatedParts(prev => {
          // Avoid duplicate entries if the query runs twice due to focus/refetch
          const existingIds = new Set(prev.map(item => item.id));
          const newItems = response.data.filter(item => !existingIds.has(item.id));
          return [...prev, ...newItems];
        });
      }
    }
  }, [response, page]);

  // Find the single most recent replacement from the current filtered list
  const mostRecentReplacement = accumulatedParts[0] || null;

  return (
    <div className="page-content fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
        <div>
          <h1 className="page-title">🔧 Parts Tracker</h1>
          <p className="page-subtitle">Track the replacement history of spare parts across your fleet</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="card-body" style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="form-label" htmlFor="part-search">Search Parts</label>
            <input
              id="part-search"
              type="text"
              className="form-input"
              placeholder="e.g. Air Filter, AC Filter, Spark Plug, Battery..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div style={{ width: 220 }}>
            <label className="form-label" htmlFor="part-vehicle-select">Filter by Vehicle</label>
            <select
              id="part-vehicle-select"
              className="form-select"
              value={selectedVehicleId}
              onChange={e => setSelectedVehicleId(e.target.value)}
            >
              <option value="">🚗 All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.type === 'car' ? '🚗' : '🏍️'} {v.nickname} ({v.make} {v.model})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Highlight Box: Last Replacement Details */}
      {mostRecentReplacement && (
        <div className="card" style={{
          marginBottom: 'var(--spacing-lg)',
          background: 'linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(147,51,234,0.06) 100%)',
          border: '1px solid rgba(59, 130, 246, 0.25)',
        }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 36, background: 'rgba(59,130,246,0.15)', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              ⚙️
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#60a5fa', fontWeight: 700, marginBottom: 4 }}>
                Last Replacement Highlight
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
                {mostRecentReplacement.description}
              </h2>
              <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 14 }}>
                Replaced <strong style={{ color: 'var(--text-primary)' }}>{formatDistanceToNow(new Date(mostRecentReplacement.service_date), { addSuffix: true })}</strong> on <span style={{ color: 'var(--text-primary)' }}>{format(new Date(mostRecentReplacement.service_date), 'dd MMMM yyyy')}</span> at <strong style={{ color: 'var(--text-primary)' }}>{mostRecentReplacement.odometer_reading?.toLocaleString()} km</strong>.
              </div>
              <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-muted)' }}>
                <span>🚗 Vehicle: <strong>{mostRecentReplacement.vehicle_nickname}</strong> ({mostRecentReplacement.vehicle_make} {mostRecentReplacement.vehicle_model})</span>
                <span>🏪 Service Center: <strong>{mostRecentReplacement.service_center || 'N/A'}</strong></span>
                <span>💰 Part Cost: <strong style={{ color: 'var(--color-success)' }}>Rs. {parseFloat(mostRecentReplacement.cost || 0).toLocaleString()}</strong></span>
              </div>
            </div>
            <div>
              <Link to={`/vehicles/${mostRecentReplacement.vehicle_id}`} className="btn btn-primary">
                View Full History
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* History Grid/Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">📜 Replaced Parts Log</h3>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Showing {accumulatedParts.length} record{accumulatedParts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {isLoading && page === 1 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
              <div className="spinner" />
            </div>
          ) : isError ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--color-danger)' }}>
              ⚠️ Failed to load parts history log.
            </div>
          ) : accumulatedParts.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <div>No replaced parts matching filters.</div>
            </div>
          ) : (
            <div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', background: 'rgba(255,255,255,0.02)' }}>
                      <th style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>Part / Spare Description</th>
                      <th style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>Vehicle</th>
                      <th style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>Odometer (km)</th>
                      <th style={{ padding: '14px 20px', color: 'var(--text-secondary)' }}>Replacement Date</th>
                      <th style={{ padding: '14px 20px', color: 'var(--text-secondary)', textAlign: 'right' }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accumulatedParts.map((p, idx) => (
                      <tr key={p.id || idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} className="table-row-hover">
                        <td style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {p.description}
                        </td>
                        <td style={{ padding: '14px 20px', color: 'var(--text-primary)' }}>
                          <Link to={`/vehicles/${p.vehicle_id}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                            {p.vehicle_nickname}
                          </Link>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.vehicle_make} {p.vehicle_model}</div>
                        </td>
                        <td style={{ padding: '14px 20px', fontWeight: 500 }}>
                          {p.odometer_reading?.toLocaleString()} km
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div>{format(new Date(p.service_date), 'dd MMM yyyy')}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDistanceToNow(new Date(p.service_date), { addSuffix: true })}</div>
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: 'var(--color-success)' }}>
                          Rs. {parseFloat(p.cost || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {response?.hasMore && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    className="btn btn-secondary"
                    disabled={isFetching}
                    onClick={() => setPage(p => p + 1)}
                    style={{ minWidth: 150 }}
                  >
                    {isFetching ? 'Loading...' : 'Load More Replaced Parts'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
