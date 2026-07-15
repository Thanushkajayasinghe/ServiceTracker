import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Modal from '../components/Modal';

const REMINDER_TEMPLATES = [
  {
    type: 'insurance',
    label: '📄 Vehicle Insurance Renewal',
    defaultMonths: 12,
    defaultKm: '',
  },
  {
    type: 'air_filter',
    label: '🌬️ Air Filter Replacement',
    defaultMonths: 12,
    defaultKm: 20000,
  },
  {
    type: 'ac',
    label: '❄️ AC Filter Replacement',
    defaultMonths: 12,
    defaultKm: 20000,
  },
  {
    type: 'wheel_alignment',
    label: '🔧 Wheel Alignment',
    defaultMonths: 6,
    defaultKm: 10000,
  },
  {
    type: 'spark_plug',
    label: '⚡ Spark Plug Replacement',
    defaultMonths: 24,
    defaultKm: 40000,
  },
  {
    type: 'other',
    label: '⚙️ Custom/Other Spare Part',
    defaultMonths: '',
    defaultKm: '',
  },
];

const INITIAL_FORM = {
  vehicleId: '',
  reminderType: 'insurance',
  customName: '',
  intervalKm: '',
  intervalMonths: '12',
  lastDoneKm: '',
  lastDoneDate: new Date().toISOString().split('T')[0],
  isActive: true,
};

const TYPE_LABEL_MAP = {
  insurance: 'Insurance Renewal',
  air_filter: 'Air Filter Replacement',
  ac: 'AC Filter Replacement',
  wheel_alignment: 'Wheel Alignment',
  spark_plug: 'Spark Plug Replacement',
  other: 'Custom/Other',
};

const TYPE_ICON_MAP = {
  insurance: '📄',
  air_filter: '🌬️',
  ac: '❄️',
  wheel_alignment: '🔧',
  spark_plug: '⚡',
  other: '⚙️',
};

export default function Reminders() {
  const queryClient = useQueryClient();
  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);

  // Complete mark-done modal state
  const [showDoneModal, setShowDoneModal] = useState(false);
  const [activeDoneReminder, setActiveDoneReminder] = useState(null);
  const [doneForm, setDoneForm] = useState({
    lastDoneDate: new Date().toISOString().split('T')[0],
    lastDoneKm: '',
  });

  // Fetch vehicles to populate dropdowns and retrieve current odometer readings
  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => api.get('/vehicles').then(r => r.data),
  });

  // Fetch reminders list
  const { data: reminders = [], isLoading } = useQuery({
    queryKey: ['reminders', selectedVehicleFilter],
    queryFn: () => api.get('/reminders', {
      params: { vehicleId: selectedVehicleFilter || undefined }
    }).then(r => r.data),
  });

  // Save (Create/Edit) Reminder Mutation
  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (editingReminder) {
        return api.put(`/reminders/${editingReminder.id}`, data);
      } else {
        return api.post('/reminders', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success(editingReminder ? 'Reminder updated!' : 'Reminder created!');
      closeModal();
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to save reminder.');
    },
  });

  // Mark Done Mutation (recomputes due date and km based on current completions)
  const markDoneMutation = useMutation({
    mutationFn: ({ id, data }) => api.put(`/reminders/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      toast.success('Reminder marked as completed & rescheduled!');
      closeDoneModal();
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to complete reminder.');
    },
  });

  // Delete Reminder Mutation
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/reminders/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('Reminder deleted.');
    },
    onError: () => {
      toast.error('Failed to delete reminder.');
    },
  });

  // Handle template selection change
  const handleTemplateChange = (type) => {
    const template = REMINDER_TEMPLATES.find(t => t.type === type);
    if (template) {
      setForm(f => ({
        ...f,
        reminderType: type,
        intervalKm: template.defaultKm,
        intervalMonths: template.defaultMonths,
      }));
    }
  };

  const openAdd = () => {
    setEditingReminder(null);
    // Use first vehicle as default value in form if available
    const firstVehicleId = vehicles[0]?.id || '';
    setForm({
      ...INITIAL_FORM,
      vehicleId: firstVehicleId,
    });
    setShowModal(true);
  };

  const openEdit = (reminder) => {
    setEditingReminder(reminder);
    setForm({
      vehicleId: reminder.vehicle_id,
      reminderType: reminder.reminder_type,
      customName: reminder.custom_name || '',
      intervalKm: reminder.interval_km || '',
      intervalMonths: reminder.interval_months || '',
      lastDoneKm: reminder.last_done_km || '',
      lastDoneDate: reminder.last_done_date ? reminder.last_done_date.split('T')[0] : '',
      isActive: reminder.is_active,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingReminder(null);
    setForm(INITIAL_FORM);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.vehicleId) {
      toast.error('Please select a vehicle.');
      return;
    }
    if (form.reminderType === 'other' && !form.customName) {
      toast.error('Please enter a custom reminder name.');
      return;
    }
    saveMutation.mutate(form);
  };

  const openDoneModal = (reminder) => {
    setActiveDoneReminder(reminder);
    // Find current odometer for this vehicle
    const vehicle = vehicles.find(v => v.id === reminder.vehicle_id);
    const lastOdo = vehicle?.last_odometer || '';
    setDoneForm({
      lastDoneDate: new Date().toISOString().split('T')[0],
      lastDoneKm: lastOdo,
    });
    setShowDoneModal(true);
  };

  const closeDoneModal = () => {
    setShowDoneModal(false);
    setActiveDoneReminder(null);
  };

  const handleDoneSubmit = (e) => {
    e.preventDefault();
    if (!doneForm.lastDoneDate) {
      toast.error('Completion date is required.');
      return;
    }
    markDoneMutation.mutate({
      id: activeDoneReminder.id,
      data: {
        lastDoneDate: doneForm.lastDoneDate,
        lastDoneKm: doneForm.lastDoneKm || null,
      },
    });
  };

  // Helper: check alert/due statuses of reminders
  const getDueStatus = (reminder) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const vehicle = vehicles.find(v => v.id === reminder.vehicle_id);
    const currentOdo = vehicle?.last_odometer || 0;

    let dateOverdue = false;
    let daysDiff = null;
    let kmOverdue = false;
    let kmDiff = null;

    if (reminder.due_date) {
      const dueDate = new Date(reminder.due_date);
      dueDate.setHours(0,0,0,0);
      daysDiff = differenceInDays(dueDate, today);
      if (daysDiff < 0) {
        dateOverdue = true;
      }
    }

    if (reminder.due_km) {
      kmDiff = reminder.due_km - currentOdo;
      if (kmDiff < 0) {
        kmOverdue = true;
      }
    }

    // Urgency determinations
    let statusText = 'On Track';
    let statusClass = 'badge-success';
    let reason = '';

    if (dateOverdue || kmOverdue) {
      statusText = 'Overdue ⚠️';
      statusClass = 'badge-danger';
      if (dateOverdue && kmOverdue) {
        reason = `Overdue by ${Math.abs(daysDiff)} days & ${Math.abs(kmDiff).toLocaleString()} km`;
      } else if (dateOverdue) {
        reason = `Overdue by ${Math.abs(daysDiff)} days`;
      } else {
        reason = `Overdue by ${Math.abs(kmDiff).toLocaleString()} km`;
      }
    } else {
      const urgentDays = daysDiff !== null && daysDiff <= 15;
      const urgentKm = kmDiff !== null && kmDiff <= 1000;

      if (urgentDays || urgentKm) {
        statusText = 'Due Soon';
        statusClass = 'badge-warning';
        if (urgentDays && urgentKm) {
          reason = `Due in ${daysDiff} days & ${kmDiff.toLocaleString()} km`;
        } else if (urgentDays) {
          reason = `Due in ${daysDiff} days`;
        } else {
          reason = `Due in ${kmDiff.toLocaleString()} km`;
        }
      } else {
        // Safe range
        statusClass = 'badge-success';
        const reasons = [];
        if (daysDiff !== null) reasons.push(`${daysDiff} days left`);
        if (kmDiff !== null) reasons.push(`${kmDiff.toLocaleString()} km left`);
        reason = reasons.join(' / ');
      }
    }

    return { statusText, statusClass, reason, overdue: dateOverdue || kmOverdue };
  };

  return (
    <div className="page-content fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
        <div>
          <h1 className="page-title">🔔 Reminders & Notifications</h1>
          <p className="page-subtitle">Manage maintenance intervals and schedule automated Telegram alerts</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          ➕ Add Reminder
        </button>
      </div>

      {/* Filter vehicles */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="card-body" style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
          <div style={{ width: 300 }}>
            <label className="form-label" htmlFor="vehicle-filter">Filter by Vehicle</label>
            <select
              id="vehicle-filter"
              className="form-select"
              value={selectedVehicleFilter}
              onChange={e => setSelectedVehicleFilter(e.target.value)}
            >
              <option value="">🚗 All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.type === 'car' ? '🚗' : '🏍️'} {v.nickname}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)' }}>Loading reminders...</p>
        </div>
      ) : reminders.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
          <h3>No Reminders Set</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 450, margin: '8px auto 24px' }}>
            Set up service reminders for insurance, air filter changes, ac filters, spark plugs, or custom spare parts to start getting Telegram notifications.
          </p>
          <button className="btn btn-primary" onClick={openAdd}>
            Create your first reminder
          </button>
        </div>
      ) : (
        <div className="reminders-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--spacing-md)' }}>
          {reminders.map(reminder => {
            const { statusText, statusClass, reason, overdue } = getDueStatus(reminder);
            const icon = TYPE_ICON_MAP[reminder.reminder_type] || '⚙️';
            const displayName = reminder.reminder_type === 'other' && reminder.custom_name
              ? reminder.custom_name
              : (TYPE_LABEL_MAP[reminder.reminder_type] || reminder.reminder_type);

            return (
              <div key={reminder.id} className="card" style={{
                position: 'relative',
                borderColor: overdue ? 'var(--color-danger)' : undefined,
                borderWidth: overdue ? 1 : undefined,
                borderStyle: overdue ? 'solid' : undefined,
              }}>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 24 }}>{icon}</span>
                        <div>
                          <h3 style={{ fontSize: 16, margin: 0, fontWeight: 600 }}>{displayName}</h3>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {reminder.vehicle_type === 'bike' ? '🏍️' : '🚗'} {reminder.vehicle_nickname}
                          </span>
                        </div>
                      </div>
                      <span className={`badge ${statusClass}`} style={{ fontSize: 11, padding: '4px 8px' }}>
                        {statusText}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, background: 'var(--bg-card-hover)', padding: 10, borderRadius: 'var(--border-radius-sm)', marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Interval:</span>
                        <span style={{ fontWeight: 500 }}>
                          {[
                            reminder.interval_km ? `${reminder.interval_km.toLocaleString()} km` : null,
                            reminder.interval_months ? `${reminder.interval_months} months` : null,
                          ].filter(Boolean).join(' / ') || 'Custom'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Last Completed:</span>
                        <span>
                          {[
                            reminder.last_done_date ? format(new Date(reminder.last_done_date), 'dd MMM yyyy') : null,
                            reminder.last_done_km ? `${reminder.last_done_km.toLocaleString()} km` : null,
                          ].filter(Boolean).join(' @ ') || 'Never'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 6, marginTop: 6, fontWeight: 500 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Next Due:</span>
                        <span style={{ color: overdue ? 'var(--color-danger)' : 'var(--text-primary)' }}>
                          {[
                            reminder.due_date ? format(new Date(reminder.due_date), 'dd MMM yyyy') : null,
                            reminder.due_km ? `${reminder.due_km.toLocaleString()} km` : null,
                          ].filter(Boolean).join(' or ') || '—'}
                        </span>
                      </div>
                    </div>

                    {reason && (
                      <div style={{ fontSize: 12, color: overdue ? 'var(--status-danger)' : 'var(--text-muted)', marginBottom: 16, fontWeight: 500 }}>
                        ⏳ Status: {reason}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button
                      className="btn btn-sm btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => openDoneModal(reminder)}
                    >
                      ✓ Completed Now
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => openEdit(reminder)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this reminder?')) {
                          deleteMutation.mutate(reminder.id);
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingReminder ? 'Edit Service Reminder' : '➕ Add Service Reminder'}
        size="md"
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : 'Save Reminder'}
            </button>
          </>
        }
      >
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label required">Vehicle</label>
            <select
              className="form-select"
              value={form.vehicleId}
              onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}
              required
            >
              <option value="" disabled>Select Vehicle</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.type === 'car' ? '🚗' : '🏍️'} {v.nickname}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label required">Reminder Template</label>
            <select
              className="form-select"
              value={form.reminderType}
              onChange={e => handleTemplateChange(e.target.value)}
              required
            >
              {REMINDER_TEMPLATES.map(t => (
                <option key={t.type} value={t.type}>{t.label}</option>
              ))}
            </select>
          </div>

          {form.reminderType === 'other' && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label required">Custom Part Name</label>
              <input
                className="form-input"
                type="text"
                placeholder="e.g. Battery, Brake Pads, Coolant"
                value={form.customName}
                onChange={e => setForm(f => ({ ...f, customName: e.target.value }))}
                required
              />
            </div>
          )}

          <div className="form-row" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Interval (km)</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 10000 (Optional)"
                value={form.intervalKm}
                onChange={e => setForm(f => ({ ...f, intervalKm: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Interval (Months)</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 12 (Optional)"
                value={form.intervalMonths}
                onChange={e => setForm(f => ({ ...f, intervalMonths: e.target.value }))}
              />
            </div>
          </div>

          <div className="form-row" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Last Performed Odometer (km)</label>
              <input
                className="form-input"
                type="number"
                placeholder="e.g. 45000 (Optional)"
                value={form.lastDoneKm}
                onChange={e => setForm(f => ({ ...f, lastDoneKm: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Last Performed Date</label>
              <input
                className="form-input"
                type="date"
                value={form.lastDoneDate}
                onChange={e => setForm(f => ({ ...f, lastDoneDate: e.target.value }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
            <input
              type="checkbox"
              id="isActive"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            />
            <label htmlFor="isActive" style={{ fontSize: 13, userSelect: 'none' }}>Enable Telegram Notification alerts</label>
          </div>
        </form>
      </Modal>

      {/* Completed Done Modal */}
      <Modal
        isOpen={showDoneModal}
        onClose={closeDoneModal}
        title="✓ Mark Task Completed"
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeDoneModal}>Cancel</button>
            <button className="btn btn-primary" onClick={handleDoneSubmit} disabled={markDoneMutation.isPending}>
              {markDoneMutation.isPending ? 'Updating...' : 'Mark Completed'}
            </button>
          </>
        }
      >
        <form onSubmit={handleDoneSubmit}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Confirm completion details to automatically reschedule the next service reminder.
          </p>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label required">Completion Date</label>
            <input
              className="form-input"
              type="date"
              value={doneForm.lastDoneDate}
              onChange={e => setDoneForm(f => ({ ...f, lastDoneDate: e.target.value }))}
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label className="form-label">Completion Odometer (km)</label>
            <input
              className="form-input"
              type="number"
              placeholder="Current mileage"
              value={doneForm.lastDoneKm}
              onChange={e => setDoneForm(f => ({ ...f, lastDoneKm: e.target.value }))}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
