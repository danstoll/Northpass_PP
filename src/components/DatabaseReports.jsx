import { useState, useEffect, useCallback } from 'react';
import './DatabaseReports.css';

/**
 * DatabaseReports Component
 * Generate reports from the local MariaDB database
 */
function DatabaseReports() {
  const [activeReport, setActiveReport] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter state
  const [filters, setFilters] = useState({ tiers: [], regions: [], owners: [] });
  const [selectedTier, setSelectedTier] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Report data
  const [overview, setOverview] = useState(null);
  const [userCerts, setUserCerts] = useState([]);
  const [notInLms, setNotInLms] = useState([]);
  const [partnersWithoutGroups, setPartnersWithoutGroups] = useState([]);
  const [certGaps, setCertGaps] = useState([]);

  // Load filter options
  const loadFilters = useCallback(async () => {
    try {
      const response = await fetch('/api/db/reports/filters');
      if (response.ok) {
        const data = await response.json();
        setFilters(data);
      }
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  }, []);

  // Load overview report
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/reports/overview');
      if (response.ok) {
        const data = await response.json();
        setOverview(data);
        setError(null);
      }
    } catch (err) {
      console.error('Overview error:', err);
      setError('Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load user certifications report
  const loadUserCerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTier) params.append('tier', selectedTier);
      if (selectedRegion) params.append('region', selectedRegion);
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await fetch(`/api/db/reports/user-certifications?${params}`);
      if (response.ok) {
        const data = await response.json();
        setUserCerts(data);
        setError(null);
      }
    } catch (err) {
      console.error('User certs error:', err);
      setError('Failed to load user certifications');
    } finally {
      setLoading(false);
    }
  }, [selectedTier, selectedRegion, searchTerm]);

  // Load contacts not in LMS
  const loadNotInLms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTier) params.append('tier', selectedTier);
      if (selectedRegion) params.append('region', selectedRegion);
      if (selectedOwner) params.append('owner', selectedOwner);
      params.append('excludePersonal', 'true');
      
      const response = await fetch(`/api/db/reports/contacts-not-in-lms?${params}`);
      if (response.ok) {
        const data = await response.json();
        setNotInLms(data);
        setError(null);
      }
    } catch (err) {
      console.error('Not in LMS error:', err);
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [selectedTier, selectedRegion, selectedOwner]);

  // Load partners without groups
  const loadPartnersWithoutGroups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/reports/partners-without-groups');
      if (response.ok) {
        const data = await response.json();
        setPartnersWithoutGroups(data);
        setError(null);
      }
    } catch (err) {
      console.error('Partners without groups error:', err);
      setError('Failed to load partners');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load certification gaps
  const loadCertGaps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTier) params.append('tier', selectedTier);
      
      const response = await fetch(`/api/db/reports/certification-gaps?${params}`);
      if (response.ok) {
        const data = await response.json();
        setCertGaps(data);
        setError(null);
      }
    } catch (err) {
      console.error('Cert gaps error:', err);
      setError('Failed to load certification gaps');
    } finally {
      setLoading(false);
    }
  }, [selectedTier]);

  // Initial load
  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  // Load report based on active tab
  useEffect(() => {
    switch (activeReport) {
      case 'overview':
        loadOverview();
        break;
      case 'certifications':
        loadUserCerts();
        break;
      case 'not-in-lms':
        loadNotInLms();
        break;
      case 'no-groups':
        loadPartnersWithoutGroups();
        break;
      case 'gaps':
        loadCertGaps();
        break;
    }
  }, [activeReport, loadOverview, loadUserCerts, loadNotInLms, loadPartnersWithoutGroups, loadCertGaps]);

  // Export to CSV
  const exportToCsv = (data, filename) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="database-reports">
      <header className="reports-header">
        <h1>📊 Database Reports</h1>
        <p>Reports generated from your local database - fast, offline-capable analytics.</p>
      </header>

      {/* Report Tabs */}
      <nav className="report-tabs">
        <button 
          className={activeReport === 'overview' ? 'active' : ''} 
          onClick={() => setActiveReport('overview')}
        >
          📈 Overview
        </button>
        <button 
          className={activeReport === 'certifications' ? 'active' : ''} 
          onClick={() => setActiveReport('certifications')}
        >
          🏆 User Certifications
        </button>
        <button 
          className={activeReport === 'not-in-lms' ? 'active' : ''} 
          onClick={() => setActiveReport('not-in-lms')}
        >
          ❌ Not in LMS
        </button>
        <button 
          className={activeReport === 'no-groups' ? 'active' : ''} 
          onClick={() => setActiveReport('no-groups')}
        >
          🏢 No Groups
        </button>
        <button 
          className={activeReport === 'gaps' ? 'active' : ''} 
          onClick={() => setActiveReport('gaps')}
        >
          ⚠️ Cert Gaps
        </button>
      </nav>

      {/* Filters */}
      {activeReport !== 'overview' && (
        <div className="report-filters">
          {(activeReport === 'certifications' || activeReport === 'not-in-lms' || activeReport === 'gaps') && (
            <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)}>
              <option value="">All Tiers</option>
              {filters.tiers.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          
          {(activeReport === 'certifications' || activeReport === 'not-in-lms') && (
            <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
              <option value="">All Regions</option>
              {filters.regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          
          {activeReport === 'not-in-lms' && (
            <select value={selectedOwner} onChange={(e) => setSelectedOwner(e.target.value)}>
              <option value="">All Owners</option>
              {filters.owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          
          {activeReport === 'certifications' && (
            <input 
              type="text" 
              placeholder="Search name, email, company..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          )}
          
          <button className="refresh-btn" onClick={() => {
            switch (activeReport) {
              case 'certifications': loadUserCerts(); break;
              case 'not-in-lms': loadNotInLms(); break;
              case 'gaps': loadCertGaps(); break;
            }
          }}>
            🔄 Refresh
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <span>{error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="loading">
          <div className="spinner"></div>
          <span>Loading report...</span>
        </div>
      )}

      {/* Report Content */}
      {!loading && (
        <div className="report-content">
          {/* Overview Report */}
          {activeReport === 'overview' && overview && (
            <div className="overview-report">
              <div className="overview-totals">
                <div className="total-card">
                  <span className="value">{overview.totals?.total_partners || 0}</span>
                  <span className="label">Partners</span>
                </div>
                <div className="total-card">
                  <span className="value">{overview.totals?.total_contacts || 0}</span>
                  <span className="label">Contacts</span>
                </div>
                <div className="total-card highlight">
                  <span className="value">{overview.totals?.lms_linked_contacts || 0}</span>
                  <span className="label">In LMS</span>
                </div>
                <div className="total-card">
                  <span className="value">{overview.totals?.total_lms_users || 0}</span>
                  <span className="label">LMS Users</span>
                </div>
              </div>

              <div className="overview-sections">
                <div className="section">
                  <h3>By Partner Tier</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Tier</th>
                        <th>Partners</th>
                        <th>Contacts</th>
                        <th>In LMS</th>
                        <th>Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.byTier?.map(row => (
                        <tr key={row.tier}>
                          <td><span className={`tier-badge ${row.tier?.toLowerCase()}`}>{row.tier}</span></td>
                          <td>{row.partner_count}</td>
                          <td>{row.contact_count}</td>
                          <td>{row.lms_linked_count}</td>
                          <td>
                            <span className={`coverage ${row.contact_count > 0 && (row.lms_linked_count / row.contact_count) > 0.5 ? 'good' : 'low'}`}>
                              {row.contact_count > 0 ? Math.round((row.lms_linked_count / row.contact_count) * 100) : 0}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="section">
                  <h3>By Region</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Region</th>
                        <th>Partners</th>
                        <th>Contacts</th>
                        <th>In LMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.byRegion?.map(row => (
                        <tr key={row.region}>
                          <td>{row.region}</td>
                          <td>{row.partner_count}</td>
                          <td>{row.contact_count}</td>
                          <td>{row.lms_linked_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="section">
                  <h3>Top Account Owners</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Owner</th>
                        <th>Partners</th>
                        <th>Contacts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.byOwner?.slice(0, 10).map(row => (
                        <tr key={row.owner}>
                          <td>{row.owner}</td>
                          <td>{row.partner_count}</td>
                          <td>{row.contact_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* User Certifications Report */}
          {activeReport === 'certifications' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{userCerts.length} contacts</span>
                <button onClick={() => exportToCsv(userCerts, 'user-certifications')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Company</th>
                    <th>Tier</th>
                    <th>Courses</th>
                    <th>Certs</th>
                    <th>NPCU</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {userCerts.map(row => (
                    <tr key={row.contact_id}>
                      <td>{row.first_name} {row.last_name}</td>
                      <td>{row.email}</td>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.completed_courses}</td>
                      <td>{row.certifications}</td>
                      <td className="npcu">{row.total_npcu}</td>
                      <td>
                        {row.lms_user_id ? (
                          <span className="status in-lms">✓ In LMS</span>
                        ) : (
                          <span className="status not-in-lms">Not in LMS</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Contacts Not in LMS Report */}
          {activeReport === 'not-in-lms' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{notInLms.length} contacts not in LMS</span>
                <button onClick={() => exportToCsv(notInLms, 'contacts-not-in-lms')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Title</th>
                    <th>Company</th>
                    <th>Tier</th>
                    <th>Region</th>
                    <th>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {notInLms.map(row => (
                    <tr key={row.id}>
                      <td>{row.first_name} {row.last_name}</td>
                      <td>{row.email}</td>
                      <td>{row.title || '-'}</td>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.account_region}</td>
                      <td>{row.account_owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Partners Without Groups Report */}
          {activeReport === 'no-groups' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{partnersWithoutGroups.length} partners without LMS groups</span>
                <button onClick={() => exportToCsv(partnersWithoutGroups, 'partners-without-groups')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Partner Name</th>
                    <th>Tier</th>
                    <th>Region</th>
                    <th>Owner</th>
                    <th>Contacts</th>
                  </tr>
                </thead>
                <tbody>
                  {partnersWithoutGroups.map(row => (
                    <tr key={row.id}>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.account_region}</td>
                      <td>{row.account_owner}</td>
                      <td>{row.contact_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Certification Gaps Report */}
          {activeReport === 'gaps' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{certGaps.filter(r => r.npcu_gap > 0).length} partners with gaps</span>
                <button onClick={() => exportToCsv(certGaps, 'certification-gaps')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Partner Name</th>
                    <th>Tier</th>
                    <th>Region</th>
                    <th>Current NPCU</th>
                    <th>Required</th>
                    <th>Gap</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {certGaps.map(row => (
                    <tr key={row.id} className={row.npcu_gap > 0 ? 'has-gap' : ''}>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.account_region}</td>
                      <td className="npcu">{row.current_npcu}</td>
                      <td>{row.required_npcu}</td>
                      <td className={row.npcu_gap > 0 ? 'gap negative' : 'gap'}>
                        {row.npcu_gap > 0 ? `-${row.npcu_gap}` : '✓'}
                      </td>
                      <td>
                        {row.npcu_gap > 0 ? (
                          <span className="status not-compliant">Needs {row.npcu_gap} more</span>
                        ) : (
                          <span className="status compliant">Compliant</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DatabaseReports;
