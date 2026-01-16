/**
 * Partner Users Report - Paginated report of all partner LMS users
 * Shows enrollments, certifications, NPCU, expired certs with actions
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  TablePagination,
  TableSortLabel,
  Tooltip,
  LinearProgress,
  Alert,
} from '@mui/material';
import {
  ArrowBack,
  Email,
  Assessment,
  Refresh,
  Download,
  Send,
  School,
  Warning,
  CheckCircle,
  Cancel,
  ExpandMore,
  ExpandLess,
  InfoOutlined,
} from '@mui/icons-material';
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
  SearchInput,
  FilterSelect,
} from './ui/NintexUI';
import { useAuth } from '../context/AuthContext';
import './PartnerUsersReport.css';

const API_BASE = '/api/db/reports';

// Column definitions
const columns = [
  { id: 'select', label: '', width: 50, sortable: false },
  { id: 'email', label: 'Email', sortable: true },
  { id: 'first_name', label: 'Name', sortable: true },
  { id: 'account_name', label: 'Partner', sortable: true },
  { id: 'partner_tier', label: 'Tier', sortable: true, width: 100 },
  { id: 'enrollments', label: 'Enrolled', sortable: true, width: 80, align: 'center' },
  { id: 'completions', label: 'Completed', sortable: true, width: 90, align: 'center' },
  { id: 'certifications', label: 'Certs', sortable: true, width: 70, align: 'center' },
  { id: 'total_npcu', label: 'NPCU', sortable: true, width: 70, align: 'center' },
  { id: 'expired_certs', label: 'Expired', sortable: true, width: 70, align: 'center' },
  { id: 'actions', label: 'Actions', width: 120, sortable: false, align: 'center' },
];

export default function PartnerUsersReport({ onBack }) {
  const { adminUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data state
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ tiers: [], regions: [], owners: [], partners: [] });
  
  // Filter state
  const [search, setSearch] = useState('');
  const [partner, setPartner] = useState('');
  const [tier, setTier] = useState('');
  const [region, setRegion] = useState('');
  const [owner, setOwner] = useState('');
  
  // Pagination & sorting
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortBy, setSortBy] = useState('total_npcu');
  const [sortDir, setSortDir] = useState('DESC');
  
  // Selection state
  const [selected, setSelected] = useState([]);
  
  // Dialog state
  const [detailDialog, setDetailDialog] = useState({ open: false, user: null, loading: false, data: null });
  const [sendDialog, setSendDialog] = useState({ open: false, users: [], sending: false });
  const [ccEmail, setCcEmail] = useState(adminUser?.email || '');

  // Load filters
  useEffect(() => {
    async function loadFilters() {
      try {
        const res = await fetch(`${API_BASE}/filters`);
        if (res.ok) {
          setFilters(await res.json());
        }
      } catch (err) {
        console.error('Failed to load filters:', err);
      }
    }
    loadFilters();
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        limit: rowsPerPage,
        offset: page * rowsPerPage,
        sortBy,
        sortDir,
      });
      
      if (search) params.set('search', search);
      if (partner) params.set('partnerId', partner);
      if (tier) params.set('tier', tier);
      if (region) params.set('region', region);
      if (owner) params.set('owner', owner);
      
      const res = await fetch(`${API_BASE}/partner-users?${params}`);
      if (!res.ok) throw new Error('Failed to load users');
      
      const result = await res.json();
      setUsers(result.data || []);
      setTotal(result.pagination?.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, sortBy, sortDir, search, partner, tier, region, owner]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle sort
  const handleSort = (column) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(column);
      setSortDir('DESC');
    }
    setPage(0);
  };

  // Handle selection
  const handleSelectAll = (event) => {
    if (event.target.checked) {
      setSelected(users.map(u => u.user_id));
    } else {
      setSelected([]);
    }
  };

  const handleSelect = (userId) => {
    setSelected(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // View user details
  const handleViewDetails = async (user) => {
    setDetailDialog({ open: true, user, loading: true, data: null });
    
    try {
      const res = await fetch(`${API_BASE}/partner-users/${user.user_id}`);
      if (!res.ok) throw new Error('Failed to load details');
      
      const data = await res.json();
      setDetailDialog(prev => ({ ...prev, loading: false, data }));
    } catch (err) {
      setDetailDialog(prev => ({ ...prev, loading: false, error: err.message }));
    }
  };

  // Send report to single user
  const handleSendReport = async (userId) => {
    const user = users.find(u => u.user_id === userId);
    setSendDialog({ open: true, users: [user], sending: false });
  };

  // Send reports to selected users
  const handleSendBulkReports = () => {
    const selectedUsers = users.filter(u => selected.includes(u.user_id));
    setSendDialog({ open: true, users: selectedUsers, sending: false });
  };

  // Confirm send
  const confirmSend = async () => {
    setSendDialog(prev => ({ ...prev, sending: true }));
    setError(null);
    
    try {
      if (sendDialog.users.length === 1) {
        // Single user
        const res = await fetch(`${API_BASE}/partner-users/${sendDialog.users[0].user_id}/send-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ccEmail })
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to send report');
        }
        
        setSuccess(`Report sent to ${sendDialog.users[0].email}`);
      } else {
        // Bulk send
        const res = await fetch(`${API_BASE}/partner-users/send-bulk-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userIds: sendDialog.users.map(u => u.user_id),
            ccEmail 
          })
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to send reports');
        }
        
        const result = await res.json();
        setSuccess(`Sent ${result.sent} reports${result.failed > 0 ? `, ${result.failed} failed` : ''}`);
      }
      
      setSendDialog({ open: false, users: [], sending: false });
      setSelected([]);
    } catch (err) {
      setError(err.message);
      setSendDialog(prev => ({ ...prev, sending: false }));
    }
  };

  // Export to CSV
  const handleExport = () => {
    const headers = ['Email', 'First Name', 'Last Name', 'Partner', 'Tier', 'Region', 'Enrollments', 'Completions', 'Certifications', 'NPCU', 'Expired Certs', 'Last Activity'];
    const rows = users.map(u => [
      u.email,
      u.first_name || '',
      u.last_name || '',
      u.account_name,
      u.partner_tier || '',
      u.account_region || '',
      u.enrollments,
      u.completions,
      u.certifications,
      u.total_npcu,
      u.expired_certs,
      u.last_activity ? new Date(u.last_activity).toLocaleDateString() : ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `partner_users_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate summary stats
  const stats = {
    totalUsers: total,
    totalNpcu: users.reduce((sum, u) => sum + (parseInt(u.total_npcu, 10) || 0), 0),
    totalCerts: users.reduce((sum, u) => sum + (parseInt(u.certifications, 10) || 0), 0),
    expiredCerts: users.reduce((sum, u) => sum + (parseInt(u.expired_certs, 10) || 0), 0),
  };

  return (
    <PageContent>
      <PageHeader
        icon={<School />}
        title="Partner Users Report"
        subtitle={`${total.toLocaleString()} users across all partners`}
        backButton={
          <IconButton onClick={onBack} sx={{ mr: 1 }}>
            <ArrowBack />
          </IconButton>
        }
      />

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      {/* Summary Stats */}
      <StatsRow>
        <StatCard
          label={<>
            Total Users
            <Tooltip title="Total number of partner users in the LMS" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          </>}
          value={stats.totalUsers.toLocaleString()}
          icon={<School />}
          variant="primary"
        />
        <StatCard
          label={<>
            Page NPCU
            <Tooltip title="Sum of NPCU from current page results (active certifications only, excludes expired)" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          </>}
          value={stats.totalNpcu.toLocaleString()}
          icon={<Assessment />}
          variant="success"
        />
        <StatCard
          label={<>
            Certifications
            <Tooltip title="Total certification completions (courses with NPCU > 0) on current page" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          </>}
          value={stats.totalCerts.toLocaleString()}
          icon={<CheckCircle />}
          variant="primary"
        />
        <StatCard
          label={<>
            Expired Certs
            <Tooltip title="Certifications past their 24-month validity (GTM: 12 months). Don't count towards NPCU." arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoOutlined sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          </>}
          value={stats.expiredCerts.toLocaleString()}
          icon={<Warning />}
          variant={stats.expiredCerts > 0 ? 'error' : 'default'}
        />
      </StatsRow>

      {/* Filters */}
      <SectionCard title="Filters" icon={<Assessment />}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchInput
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name, email, or partner..."
            sx={{ minWidth: 300 }}
          />
          
          <FilterSelect
            label="Partner"
            value={partner}
            onChange={(e) => { setPartner(e.target.value); setPage(0); }}
            options={filters.partners}
            sx={{ minWidth: 220 }}
          />
          
          <FilterSelect
            label="Tier"
            value={tier}
            onChange={(e) => { setTier(e.target.value); setPage(0); }}
            options={filters.tiers}
            sx={{ minWidth: 150 }}
          />
          
          <FilterSelect
            label="Region"
            value={region}
            onChange={(e) => { setRegion(e.target.value); setPage(0); }}
            options={filters.regions}
            sx={{ minWidth: 150 }}
          />
          
          <FilterSelect
            label="Owner"
            value={owner}
            onChange={(e) => { setOwner(e.target.value); setPage(0); }}
            options={filters.owners}
            sx={{ minWidth: 180 }}
          />
          
          <Box sx={{ flexGrow: 1 }} />
          
          <ActionButton icon={<Refresh />} onClick={loadData} variant="outlined">
            Refresh
          </ActionButton>
          
          <ActionButton icon={<Download />} onClick={handleExport} variant="outlined">
            Export CSV
          </ActionButton>
          
          {selected.length > 0 && (
            <ActionButton icon={<Send />} onClick={handleSendBulkReports} variant="contained">
              Send Reports ({selected.length})
            </ActionButton>
          )}
        </Box>
      </SectionCard>

      {/* Data Table */}
      <SectionCard>
        {loading && <LinearProgress sx={{ mb: 2 }} />}
        
        <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < users.length}
                    checked={users.length > 0 && selected.length === users.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
                {columns.slice(1).map((col) => (
                  <TableCell 
                    key={col.id}
                    align={col.align || 'left'}
                    sx={{ width: col.width, fontWeight: 600 }}
                  >
                    {col.sortable ? (
                      <TableSortLabel
                        active={sortBy === col.id}
                        direction={sortBy === col.id ? sortDir.toLowerCase() : 'desc'}
                        onClick={() => handleSort(col.id)}
                      >
                        {col.label}
                      </TableSortLabel>
                    ) : col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow 
                  key={user.user_id}
                  hover
                  selected={selected.includes(user.user_id)}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selected.includes(user.user_id)}
                      onChange={() => handleSelect(user.user_id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {user.email}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {user.first_name} {user.last_name}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                      {user.account_name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {user.partner_tier && <TierBadge tier={user.partner_tier} />}
                  </TableCell>
                  <TableCell align="center">{user.enrollments || 0}</TableCell>
                  <TableCell align="center">{user.completions || 0}</TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={user.certifications || 0} 
                      size="small"
                      color={user.certifications > 0 ? 'success' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Typography 
                      sx={{ 
                        fontWeight: 600, 
                        color: user.total_npcu > 0 ? 'var(--nintex-orange)' : 'inherit' 
                      }}
                    >
                      {user.total_npcu || 0}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    {user.expired_certs > 0 ? (
                      <Chip 
                        label={user.expired_certs} 
                        size="small"
                        color="error"
                        icon={<Warning />}
                      />
                    ) : (
                      <Typography color="text.secondary">0</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="View Details">
                      <IconButton size="small" onClick={() => handleViewDetails(user)}>
                        <Assessment />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Send Report Email">
                      <IconButton size="small" color="primary" onClick={() => handleSendReport(user.user_id)}>
                        <Email />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              
              {users.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={12}>
                    <EmptyState message="No users found matching your filters" />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(e, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </SectionCard>

      {/* User Detail Dialog */}
      <Dialog 
        open={detailDialog.open} 
        onClose={() => setDetailDialog({ open: false, user: null, loading: false, data: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          User Details: {detailDialog.user?.email}
        </DialogTitle>
        <DialogContent>
          {detailDialog.loading ? (
            <LoadingState message="Loading user details..." />
          ) : detailDialog.data ? (
            <Box>
              {/* User Info */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  {detailDialog.data.user.first_name} {detailDialog.data.user.last_name}
                </Typography>
                <Typography color="text.secondary">
                  {detailDialog.data.user.account_name} • {detailDialog.data.user.partner_tier}
                </Typography>
              </Box>
              
              {/* Stats Grid */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mb: 3 }}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color="primary">{detailDialog.data.stats.completions}</Typography>
                  <Typography variant="body2" color="text.secondary">Completed</Typography>
                </Paper>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" sx={{ color: 'var(--nintex-orange)' }}>{detailDialog.data.stats.active_npcu}</Typography>
                  <Typography variant="body2" color="text.secondary">Active NPCU</Typography>
                </Paper>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h4" color={detailDialog.data.stats.expired_certs > 0 ? 'error' : 'text.secondary'}>
                    {detailDialog.data.stats.expired_certs}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Expired</Typography>
                </Paper>
              </Box>
              
              {/* Enrollments Table */}
              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
                Course Enrollments ({detailDialog.data.enrollments.length})
              </Typography>
              <TableContainer component={Paper} sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Course</TableCell>
                      <TableCell align="center">NPCU</TableCell>
                      <TableCell align="center">Status</TableCell>
                      <TableCell align="center">Expires</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailDialog.data.enrollments.map((e, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{e.course_name}</TableCell>
                        <TableCell align="center">{e.npcu_value || 0}</TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={e.cert_status === 'expired' ? 'Expired' : e.status === 'completed' ? 'Completed' : 'In Progress'}
                            size="small"
                            color={e.cert_status === 'expired' ? 'error' : e.status === 'completed' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="center">
                          {e.expires_at ? new Date(e.expires_at).toLocaleDateString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          <ActionButton onClick={() => setDetailDialog({ open: false, user: null, loading: false, data: null })}>
            Close
          </ActionButton>
          {detailDialog.data && (
            <ActionButton 
              icon={<Email />} 
              variant="contained"
              onClick={() => {
                setDetailDialog({ open: false, user: null, loading: false, data: null });
                handleSendReport(detailDialog.user.user_id);
              }}
            >
              Send Report
            </ActionButton>
          )}
        </DialogActions>
      </Dialog>

      {/* Send Report Dialog */}
      <Dialog 
        open={sendDialog.open} 
        onClose={() => !sendDialog.sending && setSendDialog({ open: false, users: [], sending: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Send Learning Progress Report
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {sendDialog.users.length === 1 
              ? `Send a detailed learning progress report to ${sendDialog.users[0]?.email}?`
              : `Send learning progress reports to ${sendDialog.users.length} selected users?`
            }
          </Typography>
          
          <TextField
            label="CC Email (optional)"
            fullWidth
            value={ccEmail}
            onChange={(e) => setCcEmail(e.target.value)}
            placeholder="Your email to receive a copy"
            helperText="You will receive a copy of each report"
            sx={{ mt: 2 }}
          />
          
          {sendDialog.users.length > 1 && (
            <Box sx={{ mt: 2, maxHeight: 200, overflow: 'auto' }}>
              <Typography variant="caption" color="text.secondary">Recipients:</Typography>
              {sendDialog.users.map(u => (
                <Chip key={u.user_id} label={u.email} size="small" sx={{ m: 0.5 }} />
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <ActionButton 
            onClick={() => setSendDialog({ open: false, users: [], sending: false })}
            disabled={sendDialog.sending}
          >
            Cancel
          </ActionButton>
          <ActionButton 
            icon={<Send />} 
            variant="contained"
            onClick={confirmSend}
            loading={sendDialog.sending}
          >
            {sendDialog.sending ? 'Sending...' : `Send ${sendDialog.users.length > 1 ? `${sendDialog.users.length} Reports` : 'Report'}`}
          </ActionButton>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
}
