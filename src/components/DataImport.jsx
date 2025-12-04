/**
 * Data Import Component
 * Allows admins to import Excel partner data into IndexedDB
 */

import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  importContacts,
  getImportMetadata,
  getDatabaseStats,
  clearDatabase
} from '../services/partnerDatabase';
import './DataImport.css';

const DataImport = ({ onImportComplete, compact = false }) => {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  // Load existing database info on mount
  useEffect(() => {
    loadDatabaseInfo();
  }, []);

  const loadDatabaseInfo = async () => {
    try {
      const meta = await getImportMetadata();
      setMetadata(meta);
      
      if (meta) {
        const dbStats = await getDatabaseStats();
        setStats(dbStats);
      }
    } catch (err) {
      console.error('Error loading database info:', err);
    }
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleFile = async (file) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Please select an Excel file (.xlsx, .xls) or CSV file');
      return;
    }

    setImporting(true);
    setProgress(0);
    setError(null);

    try {
      // Read the file
      setProgress(10);
      const data = await file.arrayBuffer();
      
      setProgress(30);
      const workbook = XLSX.read(data, { type: 'array' });
      
      setProgress(50);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      setProgress(70);
      console.log(`Parsed ${jsonData.length} rows from ${file.name}`);

      // Import into IndexedDB
      const result = await importContacts(jsonData, file.name);
      
      setProgress(100);
      console.log(`Import complete: ${result.imported} contacts, ${result.errors} errors`);

      // Reload database info
      await loadDatabaseInfo();

      // Notify parent component
      if (onImportComplete) {
        onImportComplete(result);
      }

      setTimeout(() => {
        setImporting(false);
        setProgress(0);
      }, 1000);

    } catch (err) {
      console.error('Import error:', err);
      setError(`Import failed: ${err.message}`);
      setImporting(false);
      setProgress(0);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleClearDatabase = async () => {
    if (!window.confirm('Are you sure you want to clear all imported data? This cannot be undone.')) {
      return;
    }

    try {
      await clearDatabase();
      setMetadata(null);
      setStats(null);
      console.log('Database cleared');
    } catch (err) {
      console.error('Error clearing database:', err);
      setError(`Failed to clear database: ${err.message}`);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString();
  };

  // Compact view for embedding in other components
  if (compact) {
    return (
      <div className="data-import-compact">
        {metadata ? (
          <div className="import-status-compact">
            <span className="status-icon">✓</span>
            <span className="status-text">
              {metadata.totalContacts.toLocaleString()} contacts loaded
            </span>
            <span className="import-date">
              {formatDate(metadata.importDate)}
            </span>
            <label className="update-link">
              <input 
                type="file" 
                accept=".xlsx,.xls,.csv" 
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              Update
            </label>
          </div>
        ) : (
          <label className={`drop-zone-compact ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {importing ? (
              <span>Importing... {progress}%</span>
            ) : (
              <span>📤 Import Partner Data</span>
            )}
          </label>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="data-import-container">
      <div className="data-import-header">
        <h3>Partner Data Management</h3>
        <p>Import partner contact data from Excel for use across all admin tools</p>
      </div>

      {/* Current Database Status */}
      {metadata && (
        <div className="database-status">
          <div className="status-header">
            <span className="status-badge active">● Database Active</span>
            <button className="clear-btn" onClick={handleClearDatabase}>
              Clear Data
            </button>
          </div>
          
          <div className="status-details">
            <div className="status-item">
              <span className="label">Last Import:</span>
              <span className="value">{formatDate(metadata.importDate)}</span>
            </div>
            <div className="status-item">
              <span className="label">Source File:</span>
              <span className="value">{metadata.fileName}</span>
            </div>
            <div className="status-item">
              <span className="label">Total Contacts:</span>
              <span className="value">{metadata.totalContacts?.toLocaleString()}</span>
            </div>
            {stats && (
              <>
                <div className="status-item">
                  <span className="label">Total Accounts:</span>
                  <span className="value">{stats.totalAccounts?.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          {/* Tier Distribution */}
          {stats?.tierDistribution && (
            <div className="distribution-section">
              <h4>Contacts by Tier</h4>
              <div className="distribution-grid">
                {Object.entries(stats.tierDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([tier, count]) => (
                    <div key={tier} className="distribution-item">
                      <span className="tier-name">{tier}</span>
                      <span className="tier-count">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Region Distribution */}
          {stats?.regionDistribution && (
            <div className="distribution-section">
              <h4>Contacts by Region</h4>
              <div className="distribution-grid">
                {Object.entries(stats.regionDistribution)
                  .sort((a, b) => b[1] - a[1])
                  .map(([region, count]) => (
                    <div key={region} className="distribution-item">
                      <span className="region-name">{region}</span>
                      <span className="region-count">{count.toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Drop Zone */}
      <div 
        className={`drop-zone ${dragActive ? 'active' : ''} ${importing ? 'importing' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <label className="drop-zone-content">
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv" 
            onChange={handleFileSelect}
            disabled={importing}
            style={{ display: 'none' }}
          />
          
          {importing ? (
            <div className="import-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="progress-text">Importing... {progress}%</span>
            </div>
          ) : (
            <>
              <div className="drop-icon">📤</div>
              <div className="drop-text">
                <strong>Drop Excel file here</strong>
                <span>or click to browse</span>
              </div>
              <div className="drop-hint">
                Supports .xlsx, .xls, and .csv files
              </div>
            </>
          )}
        </label>
      </div>

      {/* Error Message */}
      {error && (
        <div className="import-error">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          <button className="dismiss-btn" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Expected Format Info */}
      <div className="format-info">
        <h4>Expected Excel Format</h4>
        <p>The Excel file should contain these columns:</p>
        <div className="column-list">
          <span>Email</span>
          <span>Contact Status</span>
          <span>First Name</span>
          <span>Last Name</span>
          <span>Title</span>
          <span>Account Name</span>
          <span>Account Status</span>
          <span>Mailing City</span>
          <span>Mailing Country</span>
          <span>Account Owner</span>
          <span>Account ID</span>
          <span>Account Region</span>
          <span>Partner Tier</span>
        </div>
      </div>
    </div>
  );
};

export default DataImport;
