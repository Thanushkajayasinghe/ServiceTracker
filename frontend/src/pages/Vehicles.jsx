import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Modal from '../components/Modal';
import FileUpload from '../components/FileUpload';

const INITIAL_FORM = {
  nickname: '', type: 'car', make: '', model: '', year: '',
  registrationNumber: '', vinChassisNumber: '', engineNumber: '',
  serviceIntervalKm: '5000', serviceIntervalMonths: '6', color: '', fuelType: '', notes: '',
};

const FUEL_TYPES = ['Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG'];

function VehicleForm({ form, setForm, onFileSelected, editingBook }) {
  return (
    <div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Nickname</label>
          <input
            className="form-input"
            placeholder="e.g., My Yaris"
            value={form.nickname}
            onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label required">Type</label>
          <select
            className="form-select"
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
          >
            <option value="car">🚗 Car</option>
            <option value="bike">🏍️ Bike</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Make</label>
          <input
            className="form-input"
            placeholder="e.g., Toyota"
            value={form.make}
            onChange={e => setForm(f => ({ ...f, make: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Model</label>
          <input
            className="form-input"
            placeholder="e.g., Yaris"
            value={form.model}
            onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Year</label>
          <input
            className="form-input"
            type="number"
            placeholder="e.g., 2022"
            min="1900"
            max={new Date().getFullYear() + 1}
            value={form.year}
            onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Registration Number</label>
          <input
            className="form-input"
            placeholder="e.g., WP ABC-1234"
            value={form.registrationNumber}
            onChange={e => setForm(f => ({ ...f, registrationNumber: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Service Interval (km)</label>
          <input
            className="form-input"
            type="number"
            placeholder="5000"
            min="500"
            value={form.serviceIntervalKm}
            onChange={e => setForm(f => ({ ...f, serviceIntervalKm: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Service Interval (Months)</label>
          <input
            className="form-input"
            type="number"
            placeholder="6"
            min="1"
            value={form.serviceIntervalMonths}
            onChange={e => setForm(f => ({ ...f, serviceIntervalMonths: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">VIN / Chassis Number</label>
          <input
            className="form-input"
            placeholder="Optional"
            value={form.vinChassisNumber}
            onChange={e => setForm(f => ({ ...f, vinChassisNumber: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Engine Number</label>
          <input
            className="form-input"
            placeholder="Optional"
            value={form.engineNumber}
            onChange={e => setForm(f => ({ ...f, engineNumber: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Color</label>
          <input
            className="form-input"
            placeholder="e.g., Pearl White"
            value={form.color}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Fuel Type</label>
          <select
            className="form-select"
            value={form.fuelType}
            onChange={e => setForm(f => ({ ...f, fuelType: e.target.value }))}
          >
            <option value="">Select fuel type</option>
            {FUEL_TYPES.map(ft => (
              <option key={ft} value={ft}>{ft}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea
          className="form-textarea"
          placeholder="Any additional notes..."
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          rows={3}
        />
      </div>

      <div className="form-group">
        {editingBook && (
          <div className="file-item" style={{ marginBottom: 8 }}>
            <span>📄</span>
            <span className="file-item-name">
              <a
                href={`http://localhost:5000/${editingBook.path}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--text-accent)', textDecoration: 'none' }}
              >
                {editingBook.name} (current)
              </a>
            </span>
          </div>
        )}
        <FileUpload
          label="Vehicle Book (PDF/Image)"
          onFilesSelected={files => onFileSelected(files[0])}
          multiple={false}
          hint="Upload vehicle registration book (PDF, JPG, PNG up to 20MB)"
        />
      </div>
    </div>
  );
}

export default function Vehicles() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [vehicleBookFile, setVehicleBookFile] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles', search, typeFilter],
    queryFn: () => api.get('/vehicles', { params: { search, type: typeFilter } }).then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => v !== undefined && v !== null && fd.append(k, v));
      if (vehicleBookFile) fd.append('vehicleBook', vehicleBookFile);

      if (editingVehicle) {
        return api.put(`/vehicles/${editingVehicle.id}`, fd);
      } else {
        return api.post('/vehicles', fd);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(editingVehicle ? 'Vehicle updated!' : 'Vehicle added!');
      closeModal();
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to save vehicle.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/vehicles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Vehicle deleted.');
      setDeleteConfirm(null);
    },
    onError: () => toast.error('Failed to delete vehicle.'),
  });

  const openAdd = () => {
    setEditingVehicle(null);
    setForm(INITIAL_FORM);
    setVehicleBookFile(null);
    setShowModal(true);
  };

  const openEdit = (v, e) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingVehicle(v);
    setForm({
      nickname: v.nickname || '',
      type: v.type || 'car',
      make: v.make || '',
      model: v.model || '',
      year: v.year || '',
      registrationNumber: v.registration_number || '',
      vinChassisNumber: v.vin_chassis_number || '',
      engineNumber: v.engine_number || '',
      serviceIntervalKm: v.service_interval_km || '5000',
      serviceIntervalMonths: v.service_interval_months || '6',
      color: v.color || '',
      fuelType: v.fuel_type || '',
      notes: v.notes || '',
    });
    setVehicleBookFile(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingVehicle(null);
    setForm(INITIAL_FORM);
    setVehicleBookFile(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nickname || !form.type) {
      toast.error('Nickname and type are required.');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div className="page-content fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Vehicles</h1>
          <p className="page-subtitle">Manage all your cars and bikes</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} id="add-vehicle-btn">
          + Add Vehicle
        </button>
      </div>

      {/* Search & Filter */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <span className="search-input-icon">🔍</span>
          <input
            className="form-input search-input"
            placeholder="Search by name, registration, make..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select filter-select"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="car">🚗 Cars</option>
          <option value="bike">🏍️ Bikes</option>
        </select>
      </div>

      {/* Vehicle Grid */}
      {isLoading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : vehicles.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">🚘</span>
          <div className="empty-state-title">
            {search || typeFilter ? 'No vehicles found' : 'No vehicles yet'}
          </div>
          <div className="empty-state-text">
            {search || typeFilter
              ? 'Try adjusting your search or filter'
              : 'Add your first vehicle to start tracking services'}
          </div>
          {!search && !typeFilter && (
            <button className="btn btn-primary" onClick={openAdd}>+ Add Vehicle</button>
          )}
        </div>
      ) : (
        <div className="vehicles-grid">
          {vehicles.map(v => (
            <Link
              key={v.id}
              to={`/vehicles/${v.id}`}
              className="vehicle-card"
              style={{ textDecoration: 'none' }}
            >
              <div className="vehicle-card-top">
                <div className={`vehicle-icon-wrapper ${v.type === 'car' ? 'vehicle-icon-car' : 'vehicle-icon-bike'}`}>
                  {v.type === 'car' ? '🚗' : '🏍️'}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div className="vehicle-card-name truncate">{v.nickname}</div>
                  {v.make && (
                    <div className="vehicle-card-meta">
                      {v.make} {v.model} {v.year && `· ${v.year}`}
                    </div>
                  )}
                  {v.registration_number && (
                    <div className="vehicle-card-reg">{v.registration_number}</div>
                  )}
                </div>
                <span className={`badge badge-${v.type}`}>
                  {v.type === 'car' ? 'Car' : 'Bike'}
                </span>
              </div>

              <div className="vehicle-card-body">
                <div className="vehicle-stats-row">
                  <div className="vehicle-stat">
                    <div className="vehicle-stat-value">
                      {v.service_count > 0 ? v.service_count : '—'}
                    </div>
                    <div className="vehicle-stat-label">Services</div>
                  </div>
                  <div className="vehicle-stat">
                    <div className="vehicle-stat-value">
                      {v.total_spent > 0 ? `Rs. ${Number(v.total_spent).toLocaleString()}` : '—'}
                    </div>
                    <div className="vehicle-stat-label">Total Spent</div>
                  </div>
                </div>

                {v.last_service_date && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)',
                    display: 'flex', justifyContent: 'space-between',
                    paddingTop: 6
                  }}>
                    <span>Last service</span>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {format(new Date(v.last_service_date), 'dd MMM yyyy')}
                    </span>
                  </div>
                )}

                {v.next_service_km && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)',
                    display: 'flex', justifyContent: 'space-between',
                    paddingTop: 3
                  }}>
                    <span>Next service (km)</span>
                    <span style={{ color: 'var(--text-accent)', fontWeight: 600 }}>
                      {Number(v.next_service_km).toLocaleString()} km
                    </span>
                  </div>
                )}

                {v.next_service_date && (
                  <div style={{
                    fontSize: 12, color: 'var(--text-muted)',
                    display: 'flex', justifyContent: 'space-between',
                    paddingTop: 3
                  }}>
                    <span>Next service (date)</span>
                    <span style={{ color: 'var(--text-accent)', fontWeight: 600 }}>
                      {format(new Date(v.next_service_date), 'dd MMM yyyy')}
                    </span>
                  </div>
                )}
              </div>

              <div className="vehicle-card-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={e => openEdit(v, e)}
                  id={`edit-vehicle-${v.id}`}
                >
                  ✏️ Edit
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDeleteConfirm(v);
                  }}
                  id={`delete-vehicle-${v.id}`}
                >
                  🗑️ Delete
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingVehicle ? `Edit ${editingVehicle.nickname}` : '+ Add New Vehicle'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <><div className="spinner spinner-sm" /> Saving...</>
              ) : (
                editingVehicle ? '✅ Save Changes' : '+ Add Vehicle'
              )}
            </button>
          </>
        }
      >
        <VehicleForm
          form={form}
          setForm={setForm}
          onFileSelected={setVehicleBookFile}
          editingBook={editingVehicle?.vehicle_book_path ? {
            path: editingVehicle.vehicle_book_path,
            name: editingVehicle.vehicle_book_original_name,
          } : null}
        />
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Vehicle"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : '🗑️ Delete Vehicle'}
            </button>
          </>
        }
      >
        <div style={{ textAlign: 'center', padding: 'var(--spacing-md) 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>
            Delete <strong>{deleteConfirm?.nickname}</strong>?
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This will permanently delete the vehicle and all {deleteConfirm?.service_count || 0} service records.
            This action cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
