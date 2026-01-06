import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Card, CardContent, Typography, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, Chip, IconButton, Button,
  TextField, Dialog, DialogTitle, DialogContent, DialogActions, Alert,
  Tabs, Tab, Switch, FormControlLabel, Tooltip, CircularProgress,
  InputAdornment, FormControl, InputLabel, Select, MenuItem, Grid
} from '@mui/material';
import {
  Person as PersonIcon,
  Email as EmailIcon,
  Send as SendIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  History as HistoryIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { PageHeader, PageContent, StatCard, StatsRow, ActionButton, LoadingState } from './ui/NintexUI';
import './PamManagement.css';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

// Simple navigation helper
const navigateTo = (path) => {
  window.location.href = path;
};

export default function PamManagement() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pams, setPams] = useState([]);
  const [stats, setStats] = useState({ totalOwners: 0, activePams: 0, withAccounts: 0, emailEnabled: 0 });
  const [includeInactive, setIncludeInactive] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Email logs
  const [emailLogs, setEmailLogs] = useState([]);
  
  // Dialogs
  const [createAccountDialog, setCreateAccountDialog] = useState({ open: false, pam: null, mode: 'create' });
  const [pamDetailsDialog, setPamDetailsDialog] = useState({ open: false, pam: null, partners: [] });
  
  // Form states
  const [accountForm, setAccountForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  
  // Operation states
  const [syncing, setSyncing] = useState(false);
  const [sendingReport, setSendingReport] = useState({});
  const [alert, setAlert] = useState({ show: false, message: '', severity: 'success' });

  // Fetch PAMs
  const fetchPams = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/db/pams?includeInactive=${includeInactive}`);
      const data = await response.json();
      setPams(data.pams || []);
      setStats(data.stats || {});
    } catch (error) {
      console.error('Error fetching PAMs:', error);
      showAlert('Failed to load PAMs', 'error');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  // Fetch email logs
  const fetchEmailLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/db/email-log?limit=50');
      const data = await response.json();
      setEmailLogs(data);
    } catch (error) {
      console.error('Error fetching email logs:', error);
    }
  }, []);

  useEffect(() => {
    fetchPams();
    fetchEmailLogs();
  }, [fetchPams, fetchEmailLogs]);

  const showAlert = (message, severity = 'success') => {
    setAlert({ show: true, message, severity });
    setTimeout(() => setAlert({ show: false, message: '', severity: 'success' }), 5000);
  };

  // Sync owners from partners table
  const syncOwners = async () => {
    try {
      setSyncing(true);
      const response = await fetch('/api/db/pams/sync-owners', { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        showAlert(data.message);
        fetchPams();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      showAlert(error.message, 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Toggle PAM status
  const togglePamStatus = async (pam) => {
    try {
      const response = await fetch(`/api/db/pams/${pam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active_pam: !pam.is_active_pam })
      });
      if (response.ok) {
        showAlert(`${pam.owner_name} ${pam.is_active_pam ? 'deactivated' : 'activated'} as PAM`);
        fetchPams();
      }
    } catch (error) {
      showAlert(error.message, 'error');
    }
  };

  // Toggle email reports
  const toggleEmailReports = async (pam) => {
    try {
      const response = await fetch(`/api/db/pams/${pam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_reports_enabled: !pam.email_reports_enabled })
      });
      if (response.ok) {
        showAlert(`Email reports ${pam.email_reports_enabled ? 'disabled' : 'enabled'} for ${pam.owner_name}`);
        fetchPams();
      }
    } catch (error) {
      showAlert(error.message, 'error');
    }
  };

  // Open create account dialog
  const openCreateAccount = (pam) => {
    const nameParts = pam.owner_name.split(' ');
    setAccountForm({
      email: pam.email || '',
      password: '',
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || ''
    });
    setSearchResults([]);
    setCreateAccountDialog({ open: true, pam, mode: 'create' });
  };

  // Search for existing admin users
  const searchAdminUsers = async (email) => {
    if (!email || email.length < 3) {
      setSearchResults([]);
      return;
    }
    try {
      setSearchingUsers(true);
      const response = await fetch(`/api/db/admin-users/search?email=${encodeURIComponent(email)}`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingUsers(false);
    }
  };

  // Link existing account
  const linkAccount = async (adminUser) => {
    try {
      const { pam } = createAccountDialog;
      const response = await fetch(`/api/db/pams/${pam.id}/link-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: adminUser.email })
      });
      const data = await response.json();
      if (response.ok) {
        showAlert(`Account linked for ${pam.owner_name}`);
        setCreateAccountDialog({ open: false, pam: null, mode: 'create' });
        fetchPams();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      showAlert(error.message, 'error');
    }
  };

  // Create account
  const createAccount = async () => {
    try {
      const { pam } = createAccountDialog;
      const response = await fetch(`/api/db/pams/${pam.id}/create-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accountForm)
      });
      const data = await response.json();
      if (response.ok) {
        showAlert(`Account created for ${pam.owner_name}`);
        setCreateAccountDialog({ open: false, pam: null, mode: 'create' });
        fetchPams();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      showAlert(error.message, 'error');
    }
  };

  // View PAM details
  const viewPamDetails = async (pam) => {
    try {
      const response = await fetch(`/api/db/pams/${pam.id}`);
      const data = await response.json();
      setPamDetailsDialog({ open: true, pam: data.pam, partners: data.partners });
    } catch (error) {
      showAlert(error.message, 'error');
    }
  };

  // Send report to PAM
  const sendReport = async (pam) => {
    try {
      setSendingReport(prev => ({ ...prev, [pam.id]: true }));
      const response = await fetch(`/api/db/pams/${pam.id}/send-report`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        showAlert(`Report sent to ${pam.owner_name}`);
        fetchPams();
        fetchEmailLogs();
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      showAlert(error.message, 'error');
    } finally {
      setSendingReport(prev => ({ ...prev, [pam.id]: false }));
    }
  };

  // Filter PAMs by search term
  const filteredPams = pams.filter(pam =>
    pam.owner_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (pam.email && pam.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (pam.region && pam.region.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading && pams.length === 0) {
    return <LoadingState message="Loading Partner Account Managers..." />;
  }

  return (
    <PageContent>
      <PageHeader
        icon="👤"
        title="PAM Management"
        subtitle="Manage Partner Account Managers and email reports"
        onBack={() => navigateTo('/admin')}
      />

      {alert.show && (
        <Alert severity={alert.severity} sx={{ mb: 2 }} onClose={() => setAlert({ ...alert, show: false })}>
          {alert.message}
        </Alert>
      )}

      <StatsRow>
        <StatCard
          label="Total Owners"
          value={stats.totalOwners}
          icon="🏢"
          variant="primary"
        />
        <StatCard
          label="Active PAMs"
          value={stats.activePams}
          icon="👤"
          variant="success"
        />
        <StatCard
          label="With Accounts"
          value={stats.withAccounts}
          icon="🔑"
          variant="primary"
        />
        <StatCard
          label="Email Enabled"
          value={stats.emailEnabled}
          icon="📧"
          variant="success"
        />
      </StatsRow>

      <Card sx={{ mt: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab icon={<PersonIcon />} label="Partner Managers" />
            <Tab icon={<HistoryIcon />} label="Email History" />
          </Tabs>
        </Box>

        {/* TAB 0: Partner Managers */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size="small"
              placeholder="Search PAMs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ minWidth: 250 }}
              InputProps={{
                startAdornment: <InputAdornment position="start">🔍</InputAdornment>
              }}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
              }
              label="Show all owners"
            />
            <Box sx={{ flexGrow: 1 }} />
            <ActionButton
              onClick={syncOwners}
              loading={syncing}
              startIcon={<RefreshIcon />}
              variant="outlined"
            >
              Sync from Partners
            </ActionButton>
          </Box>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Region</TableCell>
                  <TableCell align="center">Partners</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell align="center">Is PAM</TableCell>
                  <TableCell align="center">Has Account</TableCell>
                  <TableCell align="center">Email Reports</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPams.map((pam) => (
                  <TableRow key={pam.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {pam.owner_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={pam.region || 'Unknown'} 
                        size="small" 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={pam.partner_count || 0} 
                        size="small" 
                        color="primary"
                        onClick={() => viewPamDetails(pam)}
                        sx={{ cursor: 'pointer' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {pam.email || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={pam.is_active_pam}
                        onChange={() => togglePamStatus(pam)}
                        size="small"
                        color="success"
                      />
                    </TableCell>
                    <TableCell align="center">
                      {pam.admin_user_id ? (
                        <Tooltip title={`Logged in: ${pam.last_login_at || 'Never'}`}>
                          <Chip 
                            icon={<CheckIcon />} 
                            label="Yes" 
                            size="small" 
                            color="success"
                          />
                        </Tooltip>
                      ) : (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<AddIcon />}
                          onClick={() => openCreateAccount(pam)}
                          disabled={!pam.is_active_pam}
                        >
                          Create
                        </Button>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={pam.email_reports_enabled}
                        onChange={() => toggleEmailReports(pam)}
                        size="small"
                        disabled={!pam.email || !pam.is_active_pam}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="View Details">
                        <IconButton size="small" onClick={() => viewPamDetails(pam)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Send Report Now">
                        <span>
                          <IconButton 
                            size="small" 
                            onClick={() => sendReport(pam)}
                            disabled={!pam.email || sendingReport[pam.id]}
                          >
                            {sendingReport[pam.id] ? (
                              <CircularProgress size={16} />
                            ) : (
                              <SendIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredPams.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">
                        {searchTerm ? 'No PAMs match your search' : 'No PAMs found. Click "Sync from Partners" to import.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* TAB 1: Email History */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Recent Emails</Typography>
              <IconButton onClick={fetchEmailLogs}>
                <RefreshIcon />
              </IconButton>
            </Box>
            
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Recipient</TableCell>
                    <TableCell>Subject</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {emailLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        {new Date(log.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{log.recipient_name || log.recipient_email}</Typography>
                        {log.recipient_name && (
                          <Typography variant="caption" color="text.secondary">
                            {log.recipient_email}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{log.subject}</TableCell>
                      <TableCell>
                        <Chip 
                          label={log.email_type} 
                          size="small" 
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.status}
                          size="small"
                          color={log.status === 'sent' ? 'success' : 'error'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {emailLogs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">No emails sent yet</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </TabPanel>
      </Card>

      {/* Create/Link Account Dialog */}
      <Dialog open={createAccountDialog.open} onClose={() => setCreateAccountDialog({ open: false, pam: null, mode: 'create' })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {createAccountDialog.mode === 'create' ? 'Create Login Account' : 'Link Existing Account'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {createAccountDialog.mode === 'create' 
              ? <>Create a new login account for <strong>{createAccountDialog.pam?.owner_name}</strong></>
              : <>Link an existing admin account to <strong>{createAccountDialog.pam?.owner_name}</strong></>}
          </Typography>
          
          {/* Mode Toggle */}
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant={createAccountDialog.mode === 'create' ? 'contained' : 'outlined'}
              onClick={() => setCreateAccountDialog(prev => ({ ...prev, mode: 'create' }))}
            >
              Create New
            </Button>
            <Button
              size="small"
              variant={createAccountDialog.mode === 'link' ? 'contained' : 'outlined'}
              onClick={() => setCreateAccountDialog(prev => ({ ...prev, mode: 'link' }))}
            >
              Link Existing
            </Button>
          </Box>

          {createAccountDialog.mode === 'create' ? (
            <>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={accountForm.email}
                onChange={(e) => setAccountForm({ ...accountForm, email: e.target.value })}
                margin="normal"
                required
              />
              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={accountForm.password}
                onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })}
                margin="normal"
                required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="First Name"
                    value={accountForm.firstName}
                    onChange={(e) => setAccountForm({ ...accountForm, firstName: e.target.value })}
                    margin="normal"
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Last Name"
                    value={accountForm.lastName}
                    onChange={(e) => setAccountForm({ ...accountForm, lastName: e.target.value })}
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </>
          ) : (
            <>
              <TextField
                fullWidth
                label="Search by email"
                placeholder="Type at least 3 characters..."
                value={accountForm.email}
                onChange={(e) => {
                  setAccountForm({ ...accountForm, email: e.target.value });
                  searchAdminUsers(e.target.value);
                }}
                margin="normal"
                InputProps={{
                  endAdornment: searchingUsers && (
                    <InputAdornment position="end">
                      <CircularProgress size={20} />
                    </InputAdornment>
                  )
                }}
              />
              {searchResults.length > 0 && (
                <Paper variant="outlined" sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
                  {searchResults.map((user) => (
                    <Box
                      key={user.id}
                      sx={{
                        p: 1.5,
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'action.hover' },
                        borderBottom: '1px solid',
                        borderColor: 'divider'
                      }}
                      onClick={() => linkAccount(user)}
                    >
                      <Typography variant="body2" fontWeight="medium">
                        {user.first_name} {user.last_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.email} • {user.profile_name}
                      </Typography>
                    </Box>
                  ))}
                </Paper>
              )}
              {accountForm.email.length >= 3 && searchResults.length === 0 && !searchingUsers && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No matching accounts found. Try creating a new account instead.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateAccountDialog({ open: false, pam: null, mode: 'create' })}>Cancel</Button>
          {createAccountDialog.mode === 'create' && (
            <Button 
              variant="contained" 
              onClick={createAccount}
              disabled={!accountForm.email || !accountForm.password}
            >
              Create Account
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* PAM Details Dialog */}
      <Dialog 
        open={pamDetailsDialog.open} 
        onClose={() => setPamDetailsDialog({ open: false, pam: null, partners: [] })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {pamDetailsDialog.pam?.owner_name}
          {pamDetailsDialog.pam?.is_active_pam && (
            <Chip label="Active PAM" size="small" color="success" sx={{ ml: 1 }} />
          )}
        </DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Assigned Partners ({pamDetailsDialog.partners.length})
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Partner</TableCell>
                  <TableCell>Tier</TableCell>
                  <TableCell>Region</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pamDetailsDialog.partners.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell>{partner.account_name}</TableCell>
                    <TableCell>
                      <Chip label={partner.partner_tier || '-'} size="small" />
                    </TableCell>
                    <TableCell>{partner.account_region || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPamDetailsDialog({ open: false, pam: null, partners: [] })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
}
