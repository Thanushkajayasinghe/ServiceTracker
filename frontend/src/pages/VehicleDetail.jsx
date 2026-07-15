import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';
import Modal from '../components/Modal';
import FileUpload from '../components/FileUpload';

const INITIAL_RECORD = {
  serviceDate: new Date().toISOString().split('T')[0],
  odometerReading: '',
  serviceCenter: '',
  totalCost: '',
  notes: '',
  serviceType: 'service',
  serviceItems: [{ description: '', cost: '' }],
};

function ServiceItemsEditor({ items, onChange }) {
  const addItem = () => onChange([...items, { description: '', cost: '' }]);
  const removeItem = (i) => onChange(items.filter((_, idx) => idx !== i));
  const updateItem = (i, field, value) => {
    const updated = items.map((item, idx) =>
      idx === i ? { ...item, [field]: value } : item
    );
    onChange(updated);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>Work Done</label>
        <button type="button" className="btn btn-sm btn-secondary" onClick={addItem}>
          + Add Item
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 36px', gap: 8, marginBottom: 8 }}>
          <input
            className="form-input"
            placeholder={`Service item ${i + 1} (e.g., Oil change)`}
            value={item.description}
            onChange={e => updateItem(i, 'description', e.target.value)}
          />
          <input
            className="form-input"
            type="number"
            placeholder="Cost"
            min="0"
            value={item.cost}
            onChange={e => updateItem(i, 'cost', e.target.value)}
          />
          <button
            type="button"
            className="btn btn-icon btn-danger"
            style={{ width: 36, height: 40, fontSize: 18 }}
            onClick={() => removeItem(i)}
            disabled={items.length === 1}
          >
            ×
          </button>
        </div>
      ))}
      {items.length > 0 && (
        <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
          Total: <strong style={{ color: 'var(--text-primary)' }}>
            Rs. {items.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0).toLocaleString()}
          </strong>
        </div>
      )}
    </div>
  );
}

function ServiceRecordForm({ record, setRecord, attachmentFiles, setAttachmentFiles, existingAttachments, onDeleteAttachment }) {
  const autoTotal = record.serviceItems.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);

  return (
    <div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label required">Service Date</label>
          <input
            type="date"
            className="form-input date-input"
            value={record.serviceDate}
            onChange={e => setRecord(r => ({ ...r, serviceDate: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label required">Service Type</label>
          <select
            className="form-select"
            value={record.serviceType}
            onChange={e => setRecord(r => ({ ...r, serviceType: e.target.value }))}
          >
            <option value="service">🔧 Service</option>
            <option value="wheel_alignment">⚙️ Wheel Alignment</option>
            <option value="spare_parts">🔩 Spare Parts</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label required">Odometer Reading (km)</label>
          <input
            type="number"
            className="form-input"
            placeholder="e.g., 45200"
            min="0"
            value={record.odometerReading}
            onChange={e => setRecord(r => ({ ...r, odometerReading: e.target.value }))}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Service Center</label>
        <input
          className="form-input"
          placeholder="e.g., Toyota Service Center Colombo"
          value={record.serviceCenter}
          onChange={e => setRecord(r => ({ ...r, serviceCenter: e.target.value }))}
        />
      </div>

      <div className="form-group">
        <ServiceItemsEditor
          items={record.serviceItems}
          onChange={items => setRecord(r => ({ ...r, serviceItems: items }))}
        />
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Total Cost (Rs.)</label>
          <input
            type="number"
            className="form-input"
            placeholder={`Auto: ${autoTotal}`}
            min="0"
            value={record.totalCost}
            onChange={e => setRecord(r => ({ ...r, totalCost: e.target.value }))}
          />
          <div className="form-hint">Leave blank to use sum of work items (Rs. {autoTotal.toLocaleString()})</div>
        </div>
      </div>


      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea
          className="form-textarea"
          placeholder="Any additional notes..."
          value={record.notes}
          onChange={e => setRecord(r => ({ ...r, notes: e.target.value }))}
          rows={3}
        />
      </div>

      <div className="form-group">
        <FileUpload
          label="Attachments"
          onFilesSelected={setAttachmentFiles}
          existingFiles={existingAttachments}
          onDeleteExisting={onDeleteAttachment}
          multiple={true}
          hint="PDF, JPG, PNG, DOC up to 20MB each"
        />
      </div>
    </div>
  );
}

export default function VehicleDetail() {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [recordForm, setRecordForm] = useState(INITIAL_RECORD);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [deleteAttachmentIds, setDeleteAttachmentIds] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: vehicle, isLoading: vehicleLoading } = useQuery({
    queryKey: ['vehicle', vehicleId],
    queryFn: () => api.get(`/vehicles/${vehicleId}`).then(r => r.data),
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['records', vehicleId, search, yearFilter],
    queryFn: () => api.get(`/vehicles/${vehicleId}/records`, {
      params: { search, year: yearFilter }
    }).then(r => r.data),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const autoTotal = recordForm.serviceItems.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);
      const fd = new FormData();
      fd.append('serviceDate', recordForm.serviceDate);
      fd.append('odometerReading', recordForm.odometerReading);
      fd.append('serviceCenter', recordForm.serviceCenter);
      fd.append('totalCost', recordForm.totalCost || autoTotal);
      fd.append('notes', recordForm.notes);
      fd.append('serviceType', recordForm.serviceType || 'service');
      fd.append('serviceItems', JSON.stringify(recordForm.serviceItems));
      if (deleteAttachmentIds.length > 0) {
        fd.append('deleteAttachmentIds', JSON.stringify(deleteAttachmentIds));
      }
      attachmentFiles.forEach(f => fd.append('attachments', f));

      if (editingRecord) {
        return api.put(`/vehicles/${vehicleId}/records/${editingRecord.id}`, fd);
      } else {
        return api.post(`/vehicles/${vehicleId}/records`, fd);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(editingRecord ? 'Record updated!' : 'Service record added!');
      closeModal();
    },
    onError: (err) => {
      toast.error(err.response?.data?.error || 'Failed to save record.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/vehicles/${vehicleId}/records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['records', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Record deleted.');
      setDeleteConfirm(null);
    },
    onError: () => toast.error('Failed to delete record.'),
  });

  const openAdd = () => {
    setEditingRecord(null);
    setRecordForm(INITIAL_RECORD);
    setAttachmentFiles([]);
    setDeleteAttachmentIds([]);
    setShowModal(true);
  };

  const openEdit = (r) => {
    setEditingRecord(r);
    setRecordForm({
      serviceDate: r.service_date?.split('T')[0] || '',
      odometerReading: r.odometer_reading || '',
      serviceCenter: r.service_center || '',
      totalCost: r.total_cost || '',
      notes: r.notes || '',
      serviceType: r.service_type || 'service',
      serviceItems: r.service_items?.length > 0
        ? r.service_items.map(si => ({ description: si.description, cost: si.cost || '' }))
        : [{ description: '', cost: '' }],
    });
    setAttachmentFiles([]);
    setDeleteAttachmentIds([]);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingRecord(null);
    setRecordForm(INITIAL_RECORD);
    setAttachmentFiles([]);
    setDeleteAttachmentIds([]);
  };

  const handleDeleteAttachment = (attId) => {
    setDeleteAttachmentIds(prev => [...prev, attId]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!recordForm.serviceDate || !recordForm.odometerReading) {
      toast.error('Service date and odometer reading are required.');
      return;
    }
    saveMutation.mutate();
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - i);

  if (vehicleLoading) {
    return (
      <div className="page-content">
        <div className="loading-overlay" style={{ minHeight: 400 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="page-content">
        <div className="empty-state">
          <span className="empty-state-icon">🚘</span>
          <div className="empty-state-title">Vehicle not found</div>
          <Link to="/vehicles" className="btn btn-primary">← Back to Vehicles</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content fade-in">
      {/* Back link */}
      <Link to="/vehicles" style={{ color: 'var(--text-muted)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
        ← Back to Vehicles
      </Link>

      {/* Vehicle Header */}
      <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div className={`vehicle-icon-wrapper ${vehicle.type === 'car' ? 'vehicle-icon-car' : 'vehicle-icon-bike'}`}
              style={{ width: 72, height: 72, fontSize: 38, borderRadius: 16, flexShrink: 0 }}>
              {vehicle.type === 'car' ? '🚗' : '🏍️'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {vehicle.nickname}
                </h1>
                <span className={`badge badge-${vehicle.type}`}>{vehicle.type === 'car' ? 'Car' : 'Bike'}</span>
                {vehicle.fuel_type && <span className="badge badge-default">{vehicle.fuel_type}</span>}
              </div>
              {vehicle.make && (
                <div style={{ color: 'var(--text-secondary)', fontSize: 15, marginTop: 4 }}>
                  {vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                  {vehicle.color && ` · ${vehicle.color}`}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12 }}>
                {vehicle.registration_number && (
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>REG. NO.</span>
                    <code style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {vehicle.registration_number}
                    </code>
                  </div>
                )}
                {vehicle.vin_chassis_number && (
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>VIN/CHASSIS</span>
                    <code style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{vehicle.vin_chassis_number}</code>
                  </div>
                )}
                {vehicle.engine_number && (
                  <div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>ENGINE NO.</span>
                    <code style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{vehicle.engine_number}</code>
                  </div>
                )}
                <div>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block' }}>SERVICE INTERVAL</span>
                  <span style={{ fontSize: 14, color: 'var(--text-accent)', fontWeight: 600 }}>
                    Every {Number(vehicle.service_interval_km).toLocaleString()} km / {vehicle.service_interval_months || 6} months
                  </span>
                </div>
              </div>
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
              <div className="vehicle-stat">
                <div className="vehicle-stat-value">{vehicle.service_count || 0}</div>
                <div className="vehicle-stat-label">Services</div>
              </div>
              <div className="vehicle-stat">
                <div className="vehicle-stat-value">
                  Rs. {Number(vehicle.total_spent || 0).toLocaleString()}
                </div>
                <div className="vehicle-stat-label">Total Spent</div>
              </div>
              {vehicle.last_odometer && (
                <div className="vehicle-stat">
                  <div className="vehicle-stat-value">
                    {Number(vehicle.last_odometer).toLocaleString()}
                  </div>
                  <div className="vehicle-stat-label">Last ODO (km)</div>
                </div>
              )}
            </div>
          </div>

          {/* Next service alert */}
          {(vehicle.next_service_km || vehicle.next_service_date) && (
            <div style={{
              marginTop: 'var(--spacing-md)',
              padding: '10px 14px',
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.2)',
              borderRadius: 'var(--border-radius-sm)',
              fontSize: 13,
              color: 'var(--text-secondary)',
            }}>
              🔔 <strong style={{ color: 'var(--text-primary)' }}>Next service:</strong>{' '}
              {vehicle.next_service_km && `at ${Number(vehicle.next_service_km).toLocaleString()} km`}
              {vehicle.next_service_km && vehicle.next_service_date && ' · '}
              {vehicle.next_service_date && `on ${format(new Date(vehicle.next_service_date), 'dd MMM yyyy')}`}
            </div>
          )}

          {/* Vehicle book download */}
          {vehicle.vehicle_book_path && (
            <div style={{ marginTop: 8 }}>
              <a
                href={`http://localhost:5000/${vehicle.vehicle_book_path}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
              >
                📄 Vehicle Book
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Service Records */}
      <div className="page-header" style={{ marginBottom: 'var(--spacing-md)' }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            Service History
          </h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
            {records.length} record{records.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd} id="add-record-btn">
          + Add Service Record
        </button>
      </div>

      {/* Search & Filter */}
      <div className="search-filter-bar">
        <div className="search-input-wrapper">
          <span className="search-input-icon">🔍</span>
          <input
            className="form-input search-input"
            placeholder="Search service center or notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-select filter-select"
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
        >
          <option value="">All Years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Timeline */}
      {recordsLoading ? (
        <div className="loading-overlay"><div className="spinner" /></div>
      ) : records.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon">📋</span>
          <div className="empty-state-title">
            {search || yearFilter ? 'No records found' : 'No service records yet'}
          </div>
          <div className="empty-state-text">
            {search || yearFilter ? 'Try adjusting filters' : 'Add the first service record for this vehicle'}
          </div>
          {!search && !yearFilter && (
            <button className="btn btn-primary" onClick={openAdd}>+ Add Service Record</button>
          )}
        </div>
      ) : (
        <div className="service-timeline">
          {records.map(r => (
            <div key={r.id} className="service-record-item">
              <div className="service-record-dot" />
              <div className="service-record-card">
                <div className="service-record-header">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div className="service-record-date">
                        📅 {format(new Date(r.service_date), 'dd MMMM yyyy')}
                      </div>
                      {r.service_type && (
                        <span className={`badge badge-service-type badge-type-${r.service_type}`}>
                          {r.service_type === 'service' ? '🔧 Service'
                            : r.service_type === 'wheel_alignment' ? '⚙️ Wheel Alignment'
                            : '🔩 Spare Parts'}
                        </span>
                      )}
                    </div>
                    {r.service_center && (
                      <div className="service-record-center">🏪 {r.service_center}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div className="service-record-odo">
                      🛣️ {Number(r.odometer_reading).toLocaleString()} km
                    </div>
                    {r.next_service_km && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        Next: {Number(r.next_service_km).toLocaleString()} km
                      </div>
                    )}
                  </div>
                </div>

                {r.service_items?.length > 0 && (
                  <div className="service-items-list">
                    {r.service_items.map((si, i) => (
                      <span key={si.id || i} className="service-item-chip">
                        {si.description}
                        {si.cost > 0 && ` · Rs. ${Number(si.cost).toLocaleString()}`}
                      </span>
                    ))}
                  </div>
                )}

                {r.notes && (
                  <div style={{
                    fontSize: 13, color: 'var(--text-muted)',
                    marginTop: 8, padding: '8px 12px',
                    background: 'var(--bg-glass)',
                    borderRadius: 'var(--border-radius-sm)',
                  }}>
                    📝 {r.notes}
                  </div>
                )}

                {r.attachments?.length > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {r.attachments.map((att, i) => (
                      <a
                        key={att.id || i}
                        href={`http://localhost:5000/${att.filePath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-secondary"
                        style={{ fontSize: 11 }}
                      >
                        📎 {att.originalName}
                      </a>
                    ))}
                  </div>
                )}

                <div className="service-record-footer">
                  <div className="service-cost">
                    Rs. {Number(r.total_cost).toLocaleString()}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => openEdit(r)}
                    >
                      ✏️ Edit
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => setDeleteConfirm(r)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Service Record Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingRecord ? 'Edit Service Record' : '+ Add Service Record'}
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
                editingRecord ? '✅ Save Changes' : '+ Add Record'
              )}
            </button>
          </>
        }
      >
        <ServiceRecordForm
          record={recordForm}
          setRecord={setRecordForm}
          attachmentFiles={attachmentFiles}
          setAttachmentFiles={setAttachmentFiles}
          existingAttachments={
            editingRecord?.attachments?.filter(a => !deleteAttachmentIds.includes(a.id)) || []
          }
          onDeleteAttachment={handleDeleteAttachment}
        />
      </Modal>

      {/* Delete confirm */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Service Record"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            <button
              className="btn btn-danger"
              onClick={() => deleteMutation.mutate(deleteConfirm.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : '🗑️ Delete Record'}
            </button>
          </>
        }
      >
        <div style={{ textAlign: 'center', padding: 'var(--spacing-md) 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 8 }}>
            Delete this service record?
          </p>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Service from{' '}
            {deleteConfirm?.service_date && format(new Date(deleteConfirm.service_date), 'dd MMM yyyy')}{' '}
            at {Number(deleteConfirm?.odometer_reading || 0).toLocaleString()} km.
            This cannot be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
