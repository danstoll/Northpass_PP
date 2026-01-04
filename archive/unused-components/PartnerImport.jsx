import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './PartnerImport.css';
import northpassApi from '../services/northpassApi';
import NintexButton from './NintexButton';

const PartnerImport = () => {
  // File upload state
  const [fileData, setFileData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [columns, setColumns] = useState([]);
  const [columnMapping, setColumnMapping] = useState({
    firstName: '',
    lastName: '',
    email: '',
    partner: ''
  });
  
  // Analysis state
  const [existingGroups, setExistingGroups] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  
  // Import state
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, status: '' });
  const [importResults, setImportResults] = useState(null);

  // Load existing groups on mount
  useEffect(() => {
    loadExistingGroups();
  }, []);

  const loadExistingGroups = async () => {
    setLoadingGroups(true);
    try {
      const groups = await northpassApi.getAllGroups();
      setExistingGroups(groups);
      console.log(`✅ Loaded ${groups.length} existing groups`);
    } catch (error) {
      console.error('Error loading groups:', error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const binaryStr = evt.target.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        if (jsonData.length > 0) {
          // First row is headers
          const headers = jsonData[0].map(h => String(h || '').trim());
          setColumns(headers);
          
          // Rest is data
          const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell));
          setFileData(dataRows);
          
          // Try to auto-detect column mappings
          const firstNameCol = headers.find(h => /^first\s*name$/i.test(h)) || 
                               headers.find(h => /first/i.test(h) && /name/i.test(h));
          const lastNameCol = headers.find(h => /^last\s*name$/i.test(h)) || 
                              headers.find(h => /last/i.test(h) && /name/i.test(h)) ||
                              headers.find(h => /surname/i.test(h));
          const emailCol = headers.find(h => /email|e-mail|mail/i.test(h));
          const partnerCol = headers.find(h => /partner|group|account|company|organization/i.test(h));
          
          setColumnMapping({
            firstName: firstNameCol || '',
            lastName: lastNameCol || '',
            email: emailCol || '',
            partner: partnerCol || ''
          });
          
          console.log(`✅ Loaded ${dataRows.length} rows from ${file.name}`);
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        alert('Error parsing file. Please make sure it\'s a valid Excel file.');
      }
    };

    reader.readAsBinaryString(file);
  };

  const parseContacts = useCallback(() => {
    if (!fileData || !columns.length) return [];
    
    const firstNameIdx = columns.indexOf(columnMapping.firstName);
    const lastNameIdx = columns.indexOf(columnMapping.lastName);
    const emailIdx = columns.indexOf(columnMapping.email);
    const partnerIdx = columns.indexOf(columnMapping.partner);
    
    return fileData.map((row, idx) => {
      const firstName = firstNameIdx >= 0 ? String(row[firstNameIdx] || '').trim() : '';
      const lastName = lastNameIdx >= 0 ? String(row[lastNameIdx] || '').trim() : '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      
      return {
        id: idx,
        name: fullName,
        email: emailIdx >= 0 ? String(row[emailIdx] || '').trim().toLowerCase() : '',
        partner: partnerIdx >= 0 ? String(row[partnerIdx] || '').trim() : '',
        domain: ''
      };
    }).filter(c => c.email && c.partner).map(c => ({
      ...c,
      domain: c.email.split('@')[1] || ''
    }));
  }, [fileData, columns, columnMapping]);

  const runAnalysis = async () => {
    setLoading(true);
    
    try {
      const parsedContacts = parseContacts();
      
      // Group contacts by partner name
      const partnerMap = new Map();
      parsedContacts.forEach(contact => {
        const key = contact.partner.toLowerCase();
        if (!partnerMap.has(key)) {
          partnerMap.set(key, {
            name: contact.partner,
            contacts: [],
            domains: new Set()
          });
        }
        partnerMap.get(key).contacts.push(contact);
        if (contact.domain) {
          partnerMap.get(key).domains.add(contact.domain);
        }
      });
      
      // Create normalized group name lookup
      const existingGroupMap = new Map();
      existingGroups.forEach(g => {
        const name = g.attributes?.name || '';
        existingGroupMap.set(name.toLowerCase(), g);
      });
      
      // Analyze each partner
      const analysis = {
        totalContacts: parsedContacts.length,
        totalPartners: partnerMap.size,
        matchedPartners: [],
        missingPartners: [],
        multiCountryDomains: [],
        domainConflicts: []
      };
      
      // Track domains across partners
      const domainToPartners = new Map();
      
      partnerMap.forEach((partner, key) => {
        const existingGroup = existingGroupMap.get(key);
        const partnerInfo = {
          name: partner.name,
          contacts: partner.contacts,
          domains: Array.from(partner.domains),
          existingGroup: existingGroup ? {
            id: existingGroup.id,
            name: existingGroup.attributes?.name
          } : null
        };
        
        // Track domains for conflict detection
        partner.domains.forEach(domain => {
          if (!domainToPartners.has(domain)) {
            domainToPartners.set(domain, []);
          }
          domainToPartners.get(domain).push(partner.name);
        });
        
        if (existingGroup) {
          analysis.matchedPartners.push(partnerInfo);
        } else {
          analysis.missingPartners.push(partnerInfo);
        }
      });
      
      // Find domains used by multiple partners (multi-country scenario)
      domainToPartners.forEach((partners, domain) => {
        if (partners.length > 1) {
          analysis.multiCountryDomains.push({
            domain,
            partners,
            isCommonDomain: isCommonEmailDomain(domain)
          });
        }
      });
      
      // Sort results
      analysis.matchedPartners.sort((a, b) => a.name.localeCompare(b.name));
      analysis.missingPartners.sort((a, b) => a.name.localeCompare(b.name));
      
      setAnalysisResult(analysis);
      console.log('✅ Analysis complete:', analysis);
      
    } catch (error) {
      console.error('Error during analysis:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if domain is a common email provider (not company-specific)
  const isCommonEmailDomain = (domain) => {
    const commonDomains = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com',
      'aol.com', 'icloud.com', 'mail.com', 'protonmail.com', 'zoho.com',
      'yandex.com', 'gmx.com', 'inbox.com'
    ];
    return commonDomains.includes(domain.toLowerCase());
  };

  const importMatchedPartners = async () => {
    if (!analysisResult?.matchedPartners?.length) return;
    
    setImporting(true);
    setImportResults(null);
    
    const results = {
      successful: [],
      failed: [],
      skipped: []
    };
    
    const total = analysisResult.matchedPartners.length;
    
    for (let i = 0; i < analysisResult.matchedPartners.length; i++) {
      const partner = analysisResult.matchedPartners[i];
      setImportProgress({
        current: i + 1,
        total,
        status: `Processing ${partner.name}...`
      });
      
      try {
        // Get user IDs for contacts in this partner
        const userEmails = partner.contacts.map(c => c.email);
        
        // Search for these users in Northpass
        const foundUsers = [];
        for (const email of userEmails) {
          try {
            const users = await northpassApi.searchUsersByEmailDomain(email.split('@')[1]);
            const exactMatch = users.find(u => u.attributes?.email?.toLowerCase() === email);
            if (exactMatch) {
              foundUsers.push({
                id: exactMatch.id,
                email: exactMatch.attributes?.email,
                name: `${exactMatch.attributes?.first_name || ''} ${exactMatch.attributes?.last_name || ''}`.trim()
              });
            }
          } catch (err) {
            console.warn(`Could not find user: ${email}`);
          }
        }
        
        if (foundUsers.length > 0) {
          // Add found users to the group
          const addResult = await northpassApi.addPeopleToGroup(
            partner.existingGroup.id,
            foundUsers.map(u => u.id)
          );
          
          if (addResult.success) {
            results.successful.push({
              partner: partner.name,
              usersAdded: foundUsers.length,
              users: foundUsers
            });
          } else {
            results.failed.push({
              partner: partner.name,
              error: addResult.error
            });
          }
        } else {
          results.skipped.push({
            partner: partner.name,
            reason: 'No matching users found in Northpass'
          });
        }
        
      } catch (error) {
        results.failed.push({
          partner: partner.name,
          error: error.message
        });
      }
      
      // Small delay between partners
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    setImportResults(results);
    setImporting(false);
    setImportProgress({ current: total, total, status: 'Complete!' });
  };

  const exportMissingPartners = () => {
    if (!analysisResult?.missingPartners?.length) return;
    
    const csvContent = [
      ['Partner Name', 'Contact Count', 'Domains', 'Contact Emails'].join(','),
      ...analysisResult.missingPartners.map(p => [
        `"${p.name}"`,
        p.contacts.length,
        `"${p.domains.join('; ')}"`,
        `"${p.contacts.map(c => c.email).join('; ')}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'missing-partners.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="partner-import-content">
      <div className="import-header">
        <div className="header-content">
          <h1>📤 Partner Contact Import</h1>
          <p>Upload your Excel file to cross-reference partner contacts with Northpass groups.</p>
        </div>
        <div className="header-actions">
          <NintexButton 
            variant="secondary"
            onClick={loadExistingGroups}
            disabled={loadingGroups}
          >
            🔄 Refresh Groups ({existingGroups.length})
          </NintexButton>
        </div>
      </div>

      {/* Step 1: Upload File */}
      <div className="import-section">
        <h2>Step 1: Upload Excel File</h2>
        <div className="file-upload-area">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            id="file-upload"
            className="file-input"
          />
          <label htmlFor="file-upload" className="file-label">
            {fileName ? `📄 ${fileName}` : '📁 Click to select or drag & drop your file'}
          </label>
          {fileData && (
            <p className="file-info">
              ✅ Loaded {fileData.length} rows with {columns.length} columns
            </p>
          )}
        </div>
      </div>

      {/* Step 2: Map Columns */}
      {columns.length > 0 && (
        <div className="import-section">
          <h2>Step 2: Map Columns</h2>
          <div className="column-mapping">
            <div className="mapping-row">
              <label>First Name:</label>
              <select 
                value={columnMapping.firstName}
                onChange={(e) => setColumnMapping(prev => ({ ...prev, firstName: e.target.value }))}
              >
                <option value="">-- Select Column --</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div className="mapping-row">
              <label>Last Name:</label>
              <select 
                value={columnMapping.lastName}
                onChange={(e) => setColumnMapping(prev => ({ ...prev, lastName: e.target.value }))}
              >
                <option value="">-- Select Column --</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div className="mapping-row">
              <label>Email Address:</label>
              <select 
                value={columnMapping.email}
                onChange={(e) => setColumnMapping(prev => ({ ...prev, email: e.target.value }))}
              >
                <option value="">-- Select Column --</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
            <div className="mapping-row">
              <label>Partner/Group Name:</label>
              <select 
                value={columnMapping.partner}
                onChange={(e) => setColumnMapping(prev => ({ ...prev, partner: e.target.value }))}
              >
                <option value="">-- Select Column --</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          </div>
          
          <NintexButton 
            variant="primary"
            onClick={runAnalysis}
            disabled={!columnMapping.email || !columnMapping.partner || loading}
          >
            {loading ? '🔄 Analyzing...' : '🔍 Run Analysis'}
          </NintexButton>
        </div>
      )}

      {/* Analysis Results */}
      {analysisResult && (
        <>
          {/* Summary Stats */}
          <div className="import-section">
            <h2>Analysis Results</h2>
            <div className="summary-stats">
              <div className="stat-card">
                <span className="stat-value">{analysisResult.totalContacts}</span>
                <span className="stat-label">Total Contacts</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{analysisResult.totalPartners}</span>
                <span className="stat-label">Unique Partners</span>
              </div>
              <div className="stat-card success">
                <span className="stat-value">{analysisResult.matchedPartners.length}</span>
                <span className="stat-label">Matched Groups</span>
              </div>
              <div className="stat-card warning">
                <span className="stat-value">{analysisResult.missingPartners.length}</span>
                <span className="stat-label">Missing Groups</span>
              </div>
              <div className="stat-card info">
                <span className="stat-value">{analysisResult.multiCountryDomains.length}</span>
                <span className="stat-label">Shared Domains</span>
              </div>
            </div>
          </div>

          {/* Multi-Country Domains Warning */}
          {analysisResult.multiCountryDomains.length > 0 && (
            <div className="import-section">
              <h2>⚠️ Shared Domains (Multi-Country Partners)</h2>
              <p className="section-desc">
                These domains are used by multiple partner groups. Review carefully before importing.
              </p>
              <div className="domain-conflicts">
                {analysisResult.multiCountryDomains
                  .filter(d => !d.isCommonDomain)
                  .map((conflict, idx) => (
                    <div key={idx} className="conflict-card">
                      <div className="conflict-domain">@{conflict.domain}</div>
                      <div className="conflict-partners">
                        Used by: {conflict.partners.join(', ')}
                      </div>
                    </div>
                  ))}
                {analysisResult.multiCountryDomains.filter(d => d.isCommonDomain).length > 0 && (
                  <p className="common-domain-note">
                    ℹ️ {analysisResult.multiCountryDomains.filter(d => d.isCommonDomain).length} common 
                    email domains (gmail, yahoo, etc.) also have multiple partners - this is expected.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Missing Partners */}
          {analysisResult.missingPartners.length > 0 && (
            <div className="import-section">
              <h2>❌ Missing Groups (Need to Create)</h2>
              <div className="section-actions">
                <NintexButton variant="secondary" onClick={exportMissingPartners}>
                  📥 Export Missing Partners CSV
                </NintexButton>
              </div>
              <div className="partner-list">
                {analysisResult.missingPartners.map((partner, idx) => (
                  <div key={idx} className="partner-card missing">
                    <div className="partner-name">{partner.name}</div>
                    <div className="partner-details">
                      <span>👥 {partner.contacts.length} contacts</span>
                      <span>📧 {partner.domains.join(', ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Matched Partners */}
          {analysisResult.matchedPartners.length > 0 && (
            <div className="import-section">
              <h2>✅ Matched Groups (Ready to Import)</h2>
              <div className="section-actions">
                <NintexButton 
                  variant="primary" 
                  onClick={importMatchedPartners}
                  disabled={importing}
                >
                  {importing 
                    ? `🔄 Importing ${importProgress.current}/${importProgress.total}...`
                    : `📥 Import ${analysisResult.matchedPartners.length} Matched Partners`
                  }
                </NintexButton>
              </div>
              
              {importing && (
                <div className="import-progress">
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>
                  <p>{importProgress.status}</p>
                </div>
              )}
              
              {importResults && (
                <div className="import-results">
                  <div className="result-summary">
                    <span className="result-success">✅ {importResults.successful.length} successful</span>
                    <span className="result-skipped">⏭️ {importResults.skipped.length} skipped</span>
                    <span className="result-failed">❌ {importResults.failed.length} failed</span>
                  </div>
                </div>
              )}
              
              <div className="partner-list">
                {analysisResult.matchedPartners.map((partner, idx) => (
                  <div key={idx} className="partner-card matched">
                    <div className="partner-name">{partner.name}</div>
                    <div className="partner-details">
                      <span>👥 {partner.contacts.length} contacts</span>
                      <span>📧 {partner.domains.join(', ')}</span>
                      <span className="group-id">Group ID: {partner.existingGroup?.id?.substring(0, 8)}...</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PartnerImport;
