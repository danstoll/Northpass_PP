import { useState, useCallback } from 'react';
import { Box, LinearProgress, Alert, Typography, Collapse, Tabs, Tab } from '@mui/material';
import './Maintenance.css';
import northpassApi from '../services/northpassApi';
import {
  PageHeader,
  PageContent,
  StatsRow,
  StatCard,
  SectionCard,
  ActionButton,
  LoadingState,
  EmptyState,
  TierBadge,
  ResultAlert,
} from './ui/NintexUI';

/**
 * Maintenance - Partner Contact Group Membership Maintenance
 * Two functions:
 * 1. Contact Group Audit - Ensures contacts in DB are in proper LMS groups
 * 2. All Partners Sync - Ensures all partner group members are in "All Partners" group
 */
function Maintenance() {
  const [activeTab, setActiveTab] = useState(0);
  
  // Contact Group Audit state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [audit, setAudit] = useState(null);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [fixProgress, setFixProgress] = useState(null);
  const [fixResults, setFixResults] = useState(null);
  
  // All Partners Sync state
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncAudit, setSyncAudit] = useState(null);
  const [syncFixing, setSyncFixing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncResults, setSyncResults] = useState(null);

  // Run the contact group audit
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

  // Run the All Partners sync audit
  const runSyncAudit = useCallback(async () => {
    setSyncLoading(true);
    setSyncError(null);
    setSyncAudit(null);
    setSyncResults(null);
    
    try {
      const response = await fetch('/api/db/maintenance/all-partners-sync-audit');
      if (!response.ok) throw new Error('Failed to run sync audit');
      const data = await response.json();
      setSyncAudit(data);
    } catch (err) {
      setSyncError(err.message);
    } finally {
      setSyncLoading(false);
    }
  }, []);

  // Fix all users missing from All Partners group
  const fixAllPartnersSync = async () => {
    if (!syncAudit?.allMissingUsers?.length) return;
    
    setSyncFixing(true);
    setSyncProgress({ current: 0, total: syncAudit.allMissingUsers.length });
    
    const results = { added: 0, failed: 0, errors: [] };
    
    try {
      // Get unique user IDs
      const userIds = [...new Set(syncAudit.allMissingUsers.map(u => u.userId))];
      
      // Add users in batches of 10
      for (let i = 0; i < userIds.length; i += 10) {
        const batch = userIds.slice(i, i + 10);
        setSyncProgress({ current: i, total: userIds.length });
        
        try {
          const result = await northpassApi.addPeopleToGroup(syncAudit.allPartnersGroupId, batch);
          if (result.success) {
            results.added += batch.length;
          } else {
            results.failed += batch.length;
            results.errors.push({ batch: i / 10, error: result.error });
          }
        } catch (err) {
          results.failed += batch.length;
          results.errors.push({ batch: i / 10, error: err.message });
        }
      }
      
      setSyncResults(results);
      
      // Refresh audit
      setTimeout(() => runSyncAudit(), 2000);
      
    } catch (err) {
      setSyncError('Fix failed: ' + err.message);
    } finally {
      setSyncFixing(false);
      setSyncProgress(null);
    }
  };

  return (
    <PageContent>
      <PageHeader 
        icon="🔧" 
        title="Group Membership Maintenance" 
        subtitle="Audit and fix partner group memberships"
      />

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={activeTab} onChange={(_, newVal) => setActiveTab(newVal)}>
          <Tab label="📋 Contact Group Audit" />
          <Tab label="🌐 All Partners Sync" />
        </Tabs>
      </Box>

      {/* Tab 0: Contact Group Audit */}
      {activeTab === 0 && (
        <>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <ActionButton 
              onClick={runAudit} 
              loading={loading}
              disabled={fixing}
            >
              {loading ? '🔄 Auditing...' : '🔍 Run Audit'}
            </ActionButton>
          </Box>

          {error && (
            <ResultAlert
              type="error"
              message={error}
              onClose={() => setError(null)}
              sx={{ mb: 3 }}
            />
          )}

          {/* Fix Progress */}
          {fixProgress && (
            <SectionCard>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle1">
                  {fixProgress.stage === 'partnerGroup' && '👥 Adding to Partner Group...'}
                  {fixProgress.stage === 'allPartnersGroup' && '🌐 Adding to All Partners Group...'}
                  {fixProgress.stage === 'all' && `🔄 Processing: ${fixProgress.currentPartner || ''}`}
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  {fixProgress.current} / {fixProgress.total}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(fixProgress.current / fixProgress.total) * 100} 
                sx={{ height: 8, borderRadius: 4 }}
              />
            </SectionCard>
          )}

          {/* Fix Results */}
          {fixResults && (
            <ResultAlert
              type="success"
              title="✅ Fix Complete"
              onClose={() => setFixResults(null)}
              message={
                fixResults.partnersFixed !== undefined ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <span>Partners Processed: <strong>{fixResults.partnersFixed}</strong></span>
                    <span>Added to Partner Groups: <strong style={{ color: '#43E97B' }}>{fixResults.partnerGroupAdded}</strong></span>
                    <span>Added to All Partners: <strong style={{ color: '#43E97B' }}>{fixResults.allPartnersGroupAdded}</strong></span>
                    {fixResults.errors.length > 0 && (
                      <span>Errors: <strong style={{ color: '#FF5252' }}>{fixResults.errors.length}</strong></span>
                    )}
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    <span>Partner Group: <strong style={{ color: '#43E97B' }}>{fixResults.partnerGroup.success} added</strong>
                      {fixResults.partnerGroup.failed > 0 && (
                        <span style={{ color: '#FF5252' }}>, {fixResults.partnerGroup.failed} failed</span>
                      )}
                    </span>
                    <span>All Partners Group: <strong style={{ color: '#43E97B' }}>{fixResults.allPartnersGroup.success} added</strong>
                      {fixResults.allPartnersGroup.failed > 0 && (
                        <span style={{ color: '#FF5252' }}>, {fixResults.allPartnersGroup.failed} failed</span>
                      )}
                    </span>
                  </Box>
                )
              }
              sx={{ mb: 3 }}
            />
          )}

          {/* Audit Results */}
          {audit && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="👥" value={audit.totalContacts} label="Total Contacts" />
                <StatCard icon="📚" value={audit.withLmsAccount} label="With LMS Account" variant="success" />
                <StatCard icon="⚠️" value={audit.withoutLmsAccount} label="No LMS Account" variant="warning" />
                <StatCard icon="✅" value={audit.inPartnerGroup} label="In Partner Group" variant="success" />
              </StatsRow>
              <StatsRow columns={3}>
                <StatCard icon="❌" value={audit.missingPartnerGroup} label="Missing Partner Group" variant="error" />
                <StatCard icon="🌐" value={audit.inAllPartnersGroup} label="In All Partners" variant="success" />
                <StatCard icon="❌" value={audit.missingAllPartnersGroup} label="Missing All Partners" variant="error" />
              </StatsRow>

              {/* All Partners Group Info */}
              {audit.allPartnersGroupId && (
                <Alert severity="info" sx={{ mb: 3 }}>
                  🌐 All Partners Group: <strong>{audit.allPartnersGroupName}</strong>
                  <Typography variant="caption" sx={{ ml: 1, opacity: 0.6 }}>({audit.allPartnersGroupId})</Typography>
                </Alert>
              )}

              {/* Fix All Button */}
              {audit.partnersWithIssues?.length > 0 && (
                <SectionCard>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        ⚠️ {audit.partnersWithIssues.length} partners have membership issues
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.6 }}>
                        {audit.missingPartnerGroup} missing partner group, {audit.missingAllPartnersGroup} missing All Partners
                      </Typography>
                    </Box>
                    <ActionButton 
                      onClick={fixAllMemberships}
                      loading={fixing}
                    >
                      🔧 Fix All Missing Memberships
                    </ActionButton>
                  </Box>
                </SectionCard>
              )}

              {/* Partners with Issues */}
              {audit.partnersWithIssues?.length > 0 ? (
                <SectionCard title="Partners with Membership Issues" icon="⚠️">
                  {audit.partnersWithIssues.map(partner => (
                    <Box 
                      key={partner.partnerId}
                      sx={{ 
                        mb: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <Box 
                        sx={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                        onClick={() => setSelectedPartner(
                          selectedPartner === partner.partnerId ? null : partner.partnerId
                        )}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{partner.partnerName}</Typography>
                          <TierBadge tier={partner.tier || 'Unknown'} size="small" />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          {partner.missingPartnerGroup.length > 0 && (
                            <Typography variant="caption" sx={{ color: '#FFA726' }}>
                              👥 {partner.missingPartnerGroup.length} missing partner group
                            </Typography>
                          )}
                          {partner.missingAllPartnersGroup.length > 0 && (
                            <Typography variant="caption" sx={{ color: '#FFA726' }}>
                              🌐 {partner.missingAllPartnersGroup.length} missing All Partners
                            </Typography>
                          )}
                          <Typography sx={{ opacity: 0.5 }}>
                            {selectedPartner === partner.partnerId ? '▼' : '▶'}
                          </Typography>
                        </Box>
                      </Box>
                      
                      <Collapse in={selectedPartner === partner.partnerId}>
                        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>
                            Total Contacts: {partner.totalContacts} | With LMS: {partner.withLms} | Without LMS: {partner.withoutLms}
                            {partner.partnerGroupName && ` | Partner Group: ${partner.partnerGroupName}`}
                          </Typography>
                          
                          {/* Missing Partner Group */}
                          {partner.missingPartnerGroup.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                👥 Missing from Partner Group ({partner.missingPartnerGroup.length})
                              </Typography>
                              {partner.missingPartnerGroup.slice(0, 10).map(user => (
                                <Box key={user.userId} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                  <Typography variant="body2">{user.name || 'Unknown'}</Typography>
                                  <Typography variant="caption" sx={{ opacity: 0.5 }}>{user.email}</Typography>
                                </Box>
                              ))}
                              {partner.missingPartnerGroup.length > 10 && (
                                <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', textAlign: 'center', mt: 1 }}>
                                  ...and {partner.missingPartnerGroup.length - 10} more
                                </Typography>
                              )}
                            </Box>
                          )}
                          
                          {/* Missing All Partners Group */}
                          {partner.missingAllPartnersGroup.length > 0 && (
                            <Box sx={{ mb: 2 }}>
                              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                🌐 Missing from All Partners Group ({partner.missingAllPartnersGroup.length})
                              </Typography>
                              {partner.missingAllPartnersGroup.slice(0, 10).map(user => (
                                <Box key={user.userId} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                                  <Typography variant="body2">{user.name || 'Unknown'}</Typography>
                                  <Typography variant="caption" sx={{ opacity: 0.5 }}>{user.email}</Typography>
                                </Box>
                              ))}
                              {partner.missingAllPartnersGroup.length > 10 && (
                                <Typography variant="caption" sx={{ opacity: 0.5, display: 'block', textAlign: 'center', mt: 1 }}>
                                  ...and {partner.missingAllPartnersGroup.length - 10} more
                                </Typography>
                              )}
                            </Box>
                          )}
                          
                          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <ActionButton 
                              size="small"
                              onClick={() => fixPartnerMemberships(partner.partnerId)}
                              loading={fixing}
                            >
                              🔧 Fix This Partner's Memberships
                            </ActionButton>
                          </Box>
                        </Box>
                      </Collapse>
                    </Box>
                  ))}
                </SectionCard>
              ) : audit.totalContacts > 0 ? (
                <EmptyState
                  icon="✅"
                  title="All group memberships are correct!"
                  message="All partner contacts with LMS accounts are in their proper groups."
                />
              ) : null}
            </>
          )}

          {/* Initial State */}
          {!loading && !audit && (
            <SectionCard title="Partner Contact Group Audit" icon="🔍">
              <Box sx={{ textAlign: 'center', py: 4, maxWidth: 500, mx: 'auto' }}>
                <Typography variant="body1" sx={{ mb: 2, opacity: 0.8 }}>
                  This tool audits all partner contacts to ensure they are properly assigned to:
                </Typography>
                <Box sx={{ textAlign: 'left', pl: 4, mb: 3 }}>
                  <Typography variant="body2" sx={{ mb: 1, opacity: 0.8 }}>
                    • <strong>Partner Group</strong> - Their specific partner's LMS group
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    • <strong>All Partners Group</strong> - The master group for all partner users
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  Click "Run Audit" to scan for missing group memberships.
                </Typography>
              </Box>
            </SectionCard>
          )}

          {/* Loading State */}
          {loading && (
            <LoadingState message="Running audit... Checking contacts, LMS accounts, and group memberships..." />
          )}
        </>
      )}

      {/* Tab 1: All Partners Sync */}
      {activeTab === 1 && (
        <>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <ActionButton 
              onClick={runSyncAudit} 
              loading={syncLoading}
              disabled={syncFixing}
            >
              {syncLoading ? '🔄 Scanning...' : '🔍 Scan Partner Groups'}
            </ActionButton>
          </Box>

          {syncError && (
            <ResultAlert
              type="error"
              message={syncError}
              onClose={() => setSyncError(null)}
              sx={{ mb: 3 }}
            />
          )}

          {/* Sync Progress */}
          {syncProgress && (
            <SectionCard>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="subtitle1">🌐 Adding users to All Partners group...</Typography>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  {syncProgress.current} / {syncProgress.total}
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(syncProgress.current / syncProgress.total) * 100} 
                sx={{ height: 8, borderRadius: 4 }}
              />
            </SectionCard>
          )}

          {/* Sync Results */}
          {syncResults && (
            <ResultAlert
              type={syncResults.failed === 0 ? 'success' : 'warning'}
              title="✅ Sync Complete"
              onClose={() => setSyncResults(null)}
              message={
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  <span>Added: <strong style={{ color: '#43E97B' }}>{syncResults.added}</strong></span>
                  {syncResults.failed > 0 && (
                    <span>Failed: <strong style={{ color: '#FF5252' }}>{syncResults.failed}</strong></span>
                  )}
                </Box>
              }
              sx={{ mb: 3 }}
            />
          )}

          {/* Sync Audit Results */}
          {syncAudit && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="🏢" value={syncAudit.totalPartnerGroups} label="Partner Groups" />
                <StatCard icon="👥" value={syncAudit.totalUsersChecked} label="Users Checked" />
                <StatCard icon="✅" value={syncAudit.usersAlreadyInAllPartners} label="Already Synced" variant="success" />
                <StatCard icon="⚠️" value={syncAudit.usersMissingFromAllPartners} label="Missing from All Partners" variant={syncAudit.usersMissingFromAllPartners > 0 ? 'error' : 'success'} />
              </StatsRow>

              {/* All Partners Group Info */}
              <Alert severity="info" sx={{ mb: 3 }}>
                🌐 All Partners Group: <strong>{syncAudit.allPartnersGroupName}</strong>
                <Typography variant="caption" sx={{ ml: 1, opacity: 0.6 }}>
                  ({syncAudit.allPartnersMemberCount} members)
                </Typography>
              </Alert>

              {/* Fix Button */}
              {syncAudit.usersMissingFromAllPartners > 0 && (
                <SectionCard>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        ⚠️ {syncAudit.usersMissingFromAllPartners} users need to be added to "All Partners"
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.6 }}>
                        These users are in partner groups but not in the All Partners group (needed for LMS content access)
                      </Typography>
                    </Box>
                    <ActionButton 
                      onClick={fixAllPartnersSync}
                      loading={syncFixing}
                    >
                      🌐 Add All to "All Partners"
                    </ActionButton>
                  </Box>
                </SectionCard>
              )}

              {/* Groups with Issues */}
              {syncAudit.partnerGroupsWithIssues?.length > 0 ? (
                <SectionCard title="Partner Groups with Missing Users" icon="⚠️">
                  {syncAudit.partnerGroupsWithIssues.map(group => (
                    <Box 
                      key={group.groupId}
                      sx={{ 
                        mb: 2,
                        p: 2,
                        borderRadius: 2,
                        bgcolor: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{group.partnerName}</Typography>
                          <TierBadge tier={group.partnerTier || 'Unknown'} size="small" />
                        </Box>
                        <Typography variant="caption" sx={{ color: '#FFA726' }}>
                          {group.missingUsers.length} of {group.totalMembers} missing from All Partners
                        </Typography>
                      </Box>
                      <Box sx={{ mt: 1 }}>
                        {group.missingUsers.slice(0, 5).map(user => (
                          <Typography key={user.userId} variant="body2" sx={{ opacity: 0.7 }}>
                            • {user.name} ({user.email})
                          </Typography>
                        ))}
                        {group.missingUsers.length > 5 && (
                          <Typography variant="caption" sx={{ opacity: 0.5 }}>
                            ...and {group.missingUsers.length - 5} more
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </SectionCard>
              ) : syncAudit.totalPartnerGroups > 0 ? (
                <EmptyState
                  icon="✅"
                  title="All partner group members are synced!"
                  message="All users in partner groups are also in the All Partners group."
                />
              ) : null}
            </>
          )}

          {/* Initial State */}
          {!syncLoading && !syncAudit && (
            <SectionCard title="All Partners Group Sync" icon="🌐">
              <Box sx={{ textAlign: 'center', py: 4, maxWidth: 600, mx: 'auto' }}>
                <Typography variant="body1" sx={{ mb: 2, opacity: 0.8 }}>
                  This tool ensures all users in partner-specific groups are also in the <strong>"All Partners"</strong> group.
                </Typography>
                <Alert severity="info" sx={{ mb: 3 }}>
                  <Typography variant="body2">
                    <strong>Why is this important?</strong><br />
                    The "All Partners" group grants access to partner content on the LMS. Users who are only in their partner's group
                    but not in "All Partners" won't see partner-specific courses and content.
                  </Typography>
                </Alert>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  Click "Scan Partner Groups" to find users who need to be added.
                </Typography>
              </Box>
            </SectionCard>
          )}

          {/* Loading State */}
          {syncLoading && (
            <LoadingState message="Scanning partner groups... Checking group members against All Partners..." />
          )}
        </>
      )}
    </PageContent>
  );
}

export default Maintenance;
