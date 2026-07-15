import { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';

export default function FileUpload({
  onFilesSelected,
  existingFiles = [],
  onDeleteExisting,
  multiple = true,
  accept = '.pdf,.jpg,.jpeg,.png,.webp',
  hint = 'PDF, JPG, PNG up to 20MB each',
  label = 'Upload Files',
}) {
  const [selectedFiles, setSelectedFiles] = useState([]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple,
    onDrop: (acceptedFiles) => {
      const newFiles = multiple ? [...selectedFiles, ...acceptedFiles] : acceptedFiles;
      setSelectedFiles(newFiles);
      onFilesSelected && onFilesSelected(newFiles);
    },
  });

  const removeSelected = (index) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    onFilesSelected && onFilesSelected(updated);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  return (
    <div>
      {label && <div className="form-label" style={{ marginBottom: 6 }}>{label}</div>}

      <div
        {...getRootProps()}
        className={`file-upload-zone ${isDragActive ? 'active' : ''}`}
      >
        <input {...getInputProps()} />
        <span className="file-upload-icon">📎</span>
        <div className="file-upload-text">
          {isDragActive ? 'Drop files here...' : 'Click or drag & drop files'}
        </div>
        <div className="file-upload-hint">{hint}</div>
      </div>

      {/* Existing files */}
      {existingFiles.length > 0 && (
        <div className="file-list" style={{ marginTop: 8 }}>
          {existingFiles.map((file) => (
            <div key={file.id} className="file-item">
              <span>📄</span>
              <span className="file-item-name">
                <a
                  href={`http://localhost:5000/${file.filePath}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-accent)', textDecoration: 'none' }}
                >
                  {file.originalName}
                </a>
              </span>
              {onDeleteExisting && (
                <button
                  type="button"
                  className="btn btn-icon btn-danger btn-sm"
                  style={{ width: 28, height: 28, fontSize: 14 }}
                  onClick={() => onDeleteExisting(file.id)}
                  title="Remove file"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Newly selected files */}
      {selectedFiles.length > 0 && (
        <div className="file-list">
          {selectedFiles.map((file, i) => (
            <div key={i} className="file-item">
              <span>📄</span>
              <span className="file-item-name">{file.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {formatSize(file.size)}
              </span>
              <button
                type="button"
                className="btn btn-icon btn-danger btn-sm"
                style={{ width: 28, height: 28, fontSize: 14 }}
                onClick={() => removeSelected(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
