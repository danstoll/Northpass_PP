import { useState, useEffect, useCallback } from 'react';
import './Maintenance.css';
import NintexButton from './NintexButton';
import northpassApi from '../services/northpassApi';

/**
 * Maintenance - Partner Contact Group Membership Maintenance
 * Audits and fixes group memberships for partner contacts
 */
function Maintenance() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [audit, setAudit] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState(null);
  const [fixResults, setFixResults] = useState(null);

  // Run the audit
  const runAudit = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAudit(null);
    setSelectedPartner(null);
    setFixResults(null);
    
    try {
      const response = await fetch('/api/db/maintenance/partner-contact-audit');
      if (!response.ok) throw new Error('Failed to run audit');
      const data = await response.json();
      setAudit(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fix missing group memberships for a specific partner
  const fixPartnerMemberships = async (partnerId) => {
    const partner = audit?.byPartner?.[partnerId];
    if (!partner) return;
    
    setFixing(true);
    setFixProgress({ current: 0, total: 0, stage: 'preparing' });
    setFixResults(null);
    
    const results = {
      partnerGroup: { success: 0, failed: 0, errors: [] },
      allPartnersGroup: { success: 0, failed: 0, errors: [] }
    };
    
    try {
      // Fix partner group memberships
      if (partner.partnerGroupId && partner.missingPartnerGroup.length > 0) {
        setFixProgress({ 
          current: 0, 
          total: partner.missingPartnerGroup.length, 
          stage: 'partnerGroup' 
        });
        
        for (let i = 0; i < partner.missingPartnerGroup.length; i++) {
          const user = partner.missingPartnerGroup[i];
          try {
            await northpassApi.addUserToGroup(partner.partnerGroupId, user.userId);
            results.partnerGroup.success++;
          } catch (err) {
            results.partnerGroup.failed++;
            results.partnerGroup.errors.push({ user: user.email, error: err.message });
          }
          setFixProgress({ 
            current: i + 1, 
            total: partner.missingPartnerGroup.length, 
            stage: 'partnerGroup' 
          });
        }
      }
      
      // Fix All Partners group memberships
      if (audit.allPartnersGroupId && partner.missingAllPartnersGroup.length > 0) {
        setFixProgress({ 
          current: 0, 
          total: partner.missingAllPartnersGroup.length, 
          stage: 'allPartnersGroup' 
        });
        
        for (let i = 0; i < partner.missingAllPartnersGroup.length; i++) {
          const user = partner.missingAllPartnersGroup[i];
          try {
            await northpassApi.addUserToGroup(audit.allPartnersGroupId, user.userId);
            results.allPartnersGroup.success++;
          } catch (err) {
            results.allPartnersGroup.failed++;
            results.allPartnersGroup.errors.push({ user: user.email, error: err.message });
          }
          setFixProgress({ 
            current: i + 1, 
            total: partner.missingAllPartnersGroup.length, 
            stage: 'allPartnersGroup' 
          });
        }
      }
      
      setFixResults(results);
      
      // Refresh audit after fixes
      setTimeout(() => runAudit(), 2000);
      
    } catch (err) {
      setError('Fix failed: ' + err.message);
    } finally {
      setFixing(false);
      setFixProgress(null);
    }
  };

  // Fix ALL missing memberships
  const fixAllMemberships = async () => {
    if (!audit?.partnersWithIssues?.length) return;
    
    setFixing(true);
    setFixProgress({ current: 0, total: audit.partnersWithIssues.length, stage: 'all' });
    
    const allResults = {
      partnersFixed: 0,
      partnerGroupAdded: 0,
      allPartnersGroupAdded: 0,
      errors: []
    };
    
    try {
      for (let i = 0; i < audit.partnersWithIssues.length; i++) {
        const partner = audit.partnersWithIssues[i];
        setFixProgress({ 
          current: i + 1, 
          total: audit.partnersWithIssues.length, 
          stage: 'all',
          currentPartner: partner.partnerName
        });
        
        // Add to partner group
        if (partner.partnerGroupId && partner.missingPartnerGroup.length > 0) {
          for (const user of partner.missingPartnerGroup) {
            try {
              await northpassApi.addUserToGroup(partner.partnerGroupId, user.userId);
              allResults.partnerGroupAdded++;
            } catch (err) {
              allResults.errors.push({ partner: partner.partnerName, user: user.email, error: err.message });
            }
          }
        }
        
        // Add to All Partners group
        if (audit.allPartnersGroupId && partner.missingAllPartnersGroup.length > 0) {
          for (const user of partner.missingAllPartnersGroup) {
            try {
              await northpassApi.addUserToGroup(audit.allPartnersGroupId, user.userId);
              allResults.allPartnersGroupAdded++;
            } catch (err) {
              allResults.errors.push({ partner: partner.partnerName, user: user.email, error: err.message });
            }
          }
        }
        
        allResults.partnersFixed++;
      }
      
      setFixResults(allResults);
      
      // Refresh audit
      setTimeout(() => runAudit(), 2000);
      
    } catch (err) {
      setError('Bulk fix failed: ' + err.message);
    } finally {
      setFixing(false);
      setFixProgress(null);
    }
  };

  return (
    <div className="maintenance-content">
      <div className="maintenance-header">
        <div className="header-content">
          <h1>🔧 Group Membership Maintenance</h1>
          <p>Audit and fix partner contact group memberships</p>
        </div>
        <div className="header-actions">
          <NintexButton 
            variant="primary" 
            onClick={runAudit} 
            disabled={loading || fixing}
          >
            {loading ? '🔄 Auditing...' : '🔍 Run Audit'}
          </NintexButton>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Fix Progress */}
      {fixProgress && (
        <div className="fix-progress-banner">
          <div className="progress-info">
            <span className="progress-stage">
              {fixProgress.stage === 'partnerGroup' && '👥 Adding to Partner Group...'}
              {fixProgress.stage === 'allPartnersGroup' && '🌐 Adding to All Partners Group...'}
              {fixProgress.stage === 'all' && `🔄 Processing: ${fixProgress.currentPartner || ''}`}
            </span>
            <span className="progress-count">
              {fixProgress.current} / {fixProgress.total}
            </span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${(fixProgress.current / fixProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Fix Results */}
      {fixResults && (
        <div className="fix-results-banner">
          <h3>✅ Fix Complete</h3>
          {fixResults.partnersFixed !== undefined ? (
            // Bulk fix results
            <div className="results-grid">
              <div className="result-item">
                <span className="label">Partners Processed:</span>
                <span className="value">{fixResults.partnersFixed}</span>
              </div>
              <div className="result-item">
                <span className="label">Added to Partner Groups:</span>
                <span className="value success">{fixResults.partnerGroupAdded}</span>
              </div>
              <div className="result-item">
                <span className="label">Added to All Partners:</span>
                <span className="value success">{fixResults.allPartnersGroupAdded}</span>
              </div>
              {fixResults.errors.length > 0 && (
                <div className="result-item">
                  <span className="label">Errors:</span>
                  <span className="value error">{fixResults.errors.length}</span>
                </div>
              )}
            </div>
          ) : (
            // Single partner fix results
            <div className="results-grid">
              <div className="result-item">
                <span className="label">Partner Group:</span>
                <span className="value success">{fixResults.partnerGroup.success} added</span>
                {fixResults.partnerGroup.failed > 0 && (
                  <span className="value error">, {fixResults.partnerGroup.failed} failed</span>
                )}
              </div>
              <div className="result-item">
                <span className="label">All Partners Group:</span>
                <span className="value success">{fixResults.allPartnersGroup.success} added</span>
                {fixResults.allPartnersGroup.failed > 0 && (
                  <span className="value error">, {fixResults.allPartnersGroup.failed} failed</span>
                )}
              </div>
            </div>
          )}
          <button className="close-btn" onClick={() => setFixResults(null)}>✕</button>
        </div>
      )}

      {/* Audit Results */}
      {audit && (
        <>
          {/* Summary Stats */}
          <div className="audit-summary">
            <div className="summary-card">
              <span className="summary-value">{audit.totalContacts}</span>
              <span className="summary-label">Total Contacts</span>
            </div>
            <div className="summary-card">
              <span className="summary-value">{audit.withLmsAccount}</span>
              <span className="summary-label">With LMS Account</span>
            </div>
            <div className="summary-card warning">
              <span className="summary-value">{audit.withoutLmsAccount}</span>
              <span className="summary-label">No LMS Account</span>
            </div>
            <div className="summary-card success">
              <span className="summary-value">{audit.inPartnerGroup}</span>
              <span className="summary-label">In Partner Group</span>
            </div>
            <div className="summary-card error">
              <span className="summary-value">{audit.missingPartnerGroup}</span>
              <span className="summary-label">Missing Partner Group</span>
            </div>
            <div className="summary-card success">
              <span className="summary-value">{audit.inAllPartnersGroup}</span>
              <span className="summary-label">In All Partners</span>
            </div>
            <div className="summary-card error">
              <span className="summary-value">{audit.missingAllPartnersGroup}</span>
              <span className="summary-label">Missing All Partners</span>
            </div>
          </div>

          {/* All Partners Group Info */}
          {audit.allPartnersGroupId && (
            <div className="all-partners-info">
              <span>🌐 All Partners Group: <strong>{audit.allPartnersGroupName}</strong></span>
              <span className="group-id">({audit.allPartnersGroupId})</span>
            </div>
          )}

          {/* Fix All Button */}
          {audit.partnersWithIssues?.length > 0 && (
            <div className="fix-all-section">
              <div className="fix-all-info">
                <span className="issue-count">
                  ⚠️ {audit.partnersWithIssues.length} partners have membership issues
                </span>
                <span className="issue-detail">
                  {audit.missingPartnerGroup} missing partner group, {audit.missingAllPartnersGroup} missing All Partners
                </span>
              </div>
              <NintexButton 
                variant="primary" 
                onClick={fixAllMemberships}
                disabled={fixing}
              >
                🔧 Fix All Missing Memberships
              </NintexButton>
            </div>
          )}

          {/* Partners with Issues */}
          {audit.partnersWithIssues?.length > 0 ? (
            <div className="partners-list">
              <h2>Partners with Membership Issues</h2>
              
              {audit.partnersWithIssues.map(partner => (
                <div 
                  key={partner.partnerId} 
                  className={`partner-issue-card ${selectedPartner === partner.partnerId ? 'expanded' : ''}`}
                >
                  <div 
                    className="partner-header"
                    onClick={() => setSelectedPartner(
                      selectedPartner === partner.partnerId ? null : partner.partnerId
                    )}
                  >
                    <div className="partner-info">
                      <h3>{partner.partnerName}</h3>
                      <span className={`tier-badge tier-${(partner.tier || '').toLowerCase().replace(/\s+/g, '-')}`}>
                        {partner.tier}
                      </span>
                    </div>
                    <div className="issue-badges">
                      {partner.missingPartnerGroup.length > 0 && (
                        <span className="issue-badge partner-group">
                          👥 {partner.missingPartnerGroup.length} missing partner group
                        </span>
                      )}
                      {partner.missingAllPartnersGroup.length > 0 && (
                        <span className="issue-badge all-partners">
                          🌐 {partner.missingAllPartnersGroup.length} missing All Partners
                        </span>
                      )}
                    </div>
                    <span className="expand-icon">
                      {selectedPartner === partner.partnerId ? '▼' : '▶'}
                    </span>
                  </div>
                  
                  {selectedPartner === partner.partnerId && (
                    <div className="partner-details">
                      <div className="partner-stats">
                        <span>Total Contacts: {partner.totalContacts}</span>
                        <span>With LMS: {partner.withLms}</span>
                        <span>Without LMS: {partner.withoutLms}</span>
                        {partner.partnerGroupName && (
                          <span>Partner Group: {partner.partnerGroupName}</span>
                        )}
                      </div>
                      
                      {/* Missing Partner Group */}
                      {partner.missingPartnerGroup.length > 0 && (
                        <div className="missing-section">
                          <h4>👥 Missing from Partner Group ({partner.missingPartnerGroup.length})</h4>
                          <div className="user-list">
                            {partner.missingPartnerGroup.slice(0, 10).map(user => (
                              <div key={user.userId} className="user-item">
                                <span className="user-name">{user.name || 'Unknown'}</span>
                                <span className="user-email">{user.email}</span>
                              </div>
                            ))}
                            {partner.missingPartnerGroup.length > 10 && (
                              <div className="more-users">
                                ...and {partner.missingPartnerGroup.length - 10} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Missing All Partners Group */}
                      {partner.missingAllPartnersGroup.length > 0 && (
                        <div className="missing-section">
                          <h4>🌐 Missing from All Partners Group ({partner.missingAllPartnersGroup.length})</h4>
                          <div className="user-list">
                            {partner.missingAllPartnersGroup.slice(0, 10).map(user => (
                              <div key={user.userId} className="user-item">
                                <span className="user-name">{user.name || 'Unknown'}</span>
                                <span className="user-email">{user.email}</span>
                              </div>
                            ))}
                            {partner.missingAllPartnersGroup.length > 10 && (
                              <div className="more-users">
                                ...and {partner.missingAllPartnersGroup.length - 10} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="partner-actions">
                        <NintexButton 
                          variant="primary" 
                          size="small"
                          onClick={() => fixPartnerMemberships(partner.partnerId)}
                          disabled={fixing}
                        >
                          🔧 Fix This Partner's Memberships
                        </NintexButton>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : audit.totalContacts > 0 ? (
            <div className="no-issues">
              <span className="success-icon">✅</span>
              <h3>All group memberships are correct!</h3>
              <p>All partner contacts with LMS accounts are in their proper groups.</p>
            </div>
          ) : null}
        </>
      )}

      {/* Initial State */}
      {!loading && !audit && (
        <div className="initial-state">
          <div className="initial-icon">🔍</div>
          <h2>Partner Contact Group Audit</h2>
          <p>This tool audits all partner contacts to ensure they are properly assigned to:</p>
          <ul>
            <li><strong>Partner Group</strong> - Their specific partner's LMS group</li>
            <li><strong>All Partners Group</strong> - The master group for all partner users</li>
          </ul>
          <p>Click "Run Audit" to scan for missing group memberships.</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Running audit...</p>
          <p className="loading-detail">Checking contacts, LMS accounts, and group memberships...</p>
        </div>
      )}
    </div>
  );
}

export default Maintenance;
