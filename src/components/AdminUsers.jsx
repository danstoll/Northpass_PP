/**
 * AdminUsers - Admin user and profile management
 * Allows managing admin users and their role assignments
 */
import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Tooltip,
  Alert,
  Tabs,
  Tab,
  InputAdornment,
} from '@mui/material';
import {
  People,
  Security,
  Add,
  Edit,
  Delete,
  Lock,
  CheckCircle,
  Cancel,
  Visibility,
  VisibilityOff,
  Save,
  Refresh,
  Email,
  History,
  Login,
  Warning,
  FilterList,
  Clear,
} from '@mui/icons-material';
import { useAuth, RequirePermission } from '../context/AuthContext';
import { PageHeader, StatsRow, StatCard, ActionButton, SearchInput, EmptyState, LoadingState } from './ui/NintexUI';
import './AdminUsers.css';

const API_BASE = '/api/db';

// Permission categories
const PERMISSION_CATEGORIES = [
  { key: 'users', label: 'User Management', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'profiles', label: 'Profile Management', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'data_management', label: 'Data Management', actions: ['view', 'import', 'sync'] },
  { key: 'reports', label: 'Reports', actions: ['view', 'export'] },
  { key: 'groups', label: 'Group Management', actions: ['view', 'edit', 'match'] },
  { key: 'user_management', label: 'LMS User Management', actions: ['view', 'add_to_lms'] },
  { key: 'maintenance', label: 'Maintenance', actions: ['view', 'execute'] },
  { key: 'settings', label: 'Settings', actions: ['view', 'edit'] },
];

const AdminUsers = () => {
  const { authFetch, hasPermission } = useAuth();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Users state
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog state
  const [userDialog, setUserDialog] = useState({ open: false, mode: 'create', user: null });
  const [profileDialog, setProfileDialog] = useState({ open: false, mode: 'create', profile: null });
  const [passwordDialog, setPasswordDialog] = useState({ open: false, userId: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, type: null, id: null, name: '' });
  const [sendingCredentials, setSendingCredentials] = useState(null); // userId being sent to
  
  // Form state
  const [userForm, setUserForm] = useState({ email: '', firstName: '', lastName: '', password: '', profileId: '', isActive: true });
  const [profileForm, setProfileForm] = useState({ name: '', description: '', permissions: {} });
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Login History state
  const [loginHistory, setLoginHistory] = useState([]);
  const [loginStats, setLoginStats] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState({ userId: '', success: 'all', days: 30 });
  const [selectedUserHistory, setSelectedUserHistory] = useState(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [usersRes, profilesRes] = await Promise.all([
        authFetch(`${API_BASE}/admin/users`),
        authFetch(`${API_BASE}/admin/profiles`)
      ]);
      
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
      if (profilesRes.ok) {
        setProfiles(await profilesRes.json());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Filter users
  const filteredUsers = users.filter(user => {
    const term = searchTerm.toLowerCase();
    return (
      user.email?.toLowerCase().includes(term) ||
      user.first_name?.toLowerCase().includes(term) ||
      user.last_name?.toLowerCase().includes(term) ||
      user.profile_name?.toLowerCase().includes(term)
    );
  });

  // User CRUD
  const handleSaveUser = async () => {
    setError(null);
    
    try {
      const url = userDialog.mode === 'create' 
        ? `${API_BASE}/admin/users`
        : `${API_BASE}/admin/users/${userDialog.user.id}`;
      
      const method = userDialog.mode === 'create' ? 'POST' : 'PUT';
      
      const body = userDialog.mode === 'create'
        ? userForm
        : { 
            email: userForm.email, 
            firstName: userForm.firstName, 
            lastName: userForm.lastName, 
            profileId: userForm.profileId,
            isActive: userForm.isActive
          };
      
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save user');
      }
      
      setSuccess(`User ${userDialog.mode === 'create' ? 'created' : 'updated'} successfully`);
      setUserDialog({ open: false, mode: 'create', user: null });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChangePassword = async () => {
    setError(null);
    
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${passwordDialog.userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change password');
      }
      
      setSuccess('Password changed successfully');
      setPasswordDialog({ open: false, userId: null });
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSendCredentials = async (userId, userEmail) => {
    setError(null);
    setSendingCredentials(userId);
    
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}/send-credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}) // Auto-generate password
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send credentials');
      }
      
      setSuccess(`Credentials email sent to ${userEmail}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingCredentials(null);
    }
  };

  const handleDeleteUser = async () => {
    setError(null);
    
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${deleteDialog.id}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete user');
      }
      
      setSuccess('User deleted successfully');
      setDeleteDialog({ open: false, type: null, id: null, name: '' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Profile CRUD
  const handleSaveProfile = async () => {
    setError(null);
    
    try {
      const url = profileDialog.mode === 'create' 
        ? `${API_BASE}/admin/profiles`
        : `${API_BASE}/admin/profiles/${profileDialog.profile.id}`;
      
      const method = profileDialog.mode === 'create' ? 'POST' : 'PUT';
      
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save profile');
      }
      
      setSuccess(`Profile ${profileDialog.mode === 'create' ? 'created' : 'updated'} successfully`);
      setProfileDialog({ open: false, mode: 'create', profile: null });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteProfile = async () => {
    setError(null);
    
    try {
      const res = await authFetch(`${API_BASE}/admin/profiles/${deleteDialog.id}`, {
        method: 'DELETE'
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete profile');
      }
      
      setSuccess('Profile deleted successfully');
      setDeleteDialog({ open: false, type: null, id: null, name: '' });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Open dialogs
  const openUserDialog = (mode, user = null) => {
    if (mode === 'edit' && user) {
      setUserForm({
        email: user.email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        password: '',
        profileId: user.profile_id,
        isActive: user.is_active
      });
    } else {
      setUserForm({ email: '', firstName: '', lastName: '', password: '', profileId: profiles[0]?.id || '', isActive: true });
    }
    setUserDialog({ open: true, mode, user });
  };

  const openProfileDialog = (mode, profile = null) => {
    if (mode === 'edit' && profile) {
      setProfileForm({
        name: profile.name,
        description: profile.description || '',
        permissions: profile.permissions || {}
      });
    } else {
      // Initialize empty permissions
      const emptyPermissions = {};
      PERMISSION_CATEGORIES.forEach(cat => {
        emptyPermissions[cat.key] = {};
        cat.actions.forEach(action => {
          emptyPermissions[cat.key][action] = false;
        });
      });
      setProfileForm({ name: '', description: '', permissions: emptyPermissions });
    }
    setProfileDialog({ open: true, mode, profile });
  };

  // Toggle permission
  const togglePermission = (category, action) => {
    setProfileForm(prev => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [category]: {
          ...prev.permissions[category],
          [action]: !prev.permissions[category]?.[action]
        }
      }
    }));
  };

  // Load login history
  const loadLoginHistory = async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('limit', '200');
      if (historyFilter.userId) params.append('userId', historyFilter.userId);
      if (historyFilter.success !== 'all') params.append('success', historyFilter.success);
      
      const [historyRes, statsRes] = await Promise.all([
        authFetch(`${API_BASE}/auth/login-history?${params}`),
        authFetch(`${API_BASE}/auth/login-stats?days=${historyFilter.days}`)
      ]);
      
      if (historyRes.ok) {
        setLoginHistory(await historyRes.json());
      }
      if (statsRes.ok) {
        setLoginStats(await statsRes.json());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load history when tab changes or filter changes
  useEffect(() => {
    if (tab === 2) {
      loadLoginHistory();
    }
  }, [tab, historyFilter.userId, historyFilter.success]);

  // View user's login history
  const viewUserHistory = (user) => {
    setSelectedUserHistory(user);
    setHistoryFilter(prev => ({ ...prev, userId: user.id.toString() }));
    setTab(2);
  };

  // Stats
  const activeUsers = users.filter(u => u.is_active).length;
  const systemProfiles = profiles.filter(p => p.is_system).length;

  if (loading) {
    return <LoadingState message="Loading admin users..." />;
  }

  return (
    <div className="admin-users">
      <PageHeader
        icon={<People />}
        title="Admin Users & Profiles"
        subtitle="Manage admin user accounts and role-based access control"
      />

      {/* Alerts */}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Stats */}
      <StatsRow>
        <StatCard label="Total Users" value={users.length} icon={<People />} />
        <StatCard label="Active Users" value={activeUsers} icon={<CheckCircle />} variant="success" />
        <StatCard label="Profiles" value={profiles.length} icon={<Security />} />
        <StatCard label="System Profiles" value={systemProfiles} icon={<Lock />} variant="info" />
      </StatsRow>

      {/* Tabs */}
      <Card sx={{ mt: 3 }}>
        <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Users" icon={<People />} iconPosition="start" />
          <Tab label="Profiles" icon={<Security />} iconPosition="start" />
          <Tab label="Login History" icon={<History />} iconPosition="start" />
        </Tabs>

        <CardContent>
          {/* Users Tab */}
          {tab === 0 && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Search users..."
                />
                <RequirePermission category="users" action="create">
                  <ActionButton icon={<Add />} onClick={() => openUserDialog('create')}>
                    Add User
                  </ActionButton>
                </RequirePermission>
              </Box>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Profile</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Last Login</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell>
                          {user.first_name} {user.last_name}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Chip 
                            label={user.profile_name} 
                            size="small" 
                            color={user.profile_name === 'Admin' ? 'error' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={user.is_active ? 'Active' : 'Inactive'}
                            size="small"
                            color={user.is_active ? 'success' : 'default'}
                            icon={user.is_active ? <CheckCircle /> : <Cancel />}
                          />
                        </TableCell>
                        <TableCell>
                          {user.last_login_at 
                            ? new Date(user.last_login_at).toLocaleDateString()
                            : 'Never'
                          }
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="View Login History">
                            <IconButton size="small" onClick={() => viewUserHistory(user)}>
                              <History />
                            </IconButton>
                          </Tooltip>
                          <RequirePermission category="users" action="edit">
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => openUserDialog('edit', user)}>
                                <Edit />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Change Password">
                              <IconButton size="small" onClick={() => setPasswordDialog({ open: true, userId: user.id })}>
                                <Lock />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Send Login Credentials">
                              <IconButton 
                                size="small" 
                                color="primary"
                                onClick={() => handleSendCredentials(user.id, user.email)}
                                disabled={sendingCredentials === user.id}
                              >
                                {sendingCredentials === user.id ? (
                                  <Box sx={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Box className="ntx-spinner" sx={{ width: 16, height: 16 }} />
                                  </Box>
                                ) : (
                                  <Email />
                                )}
                              </IconButton>
                            </Tooltip>
                          </RequirePermission>
                          <RequirePermission category="users" action="delete">
                            <Tooltip title="Delete">
                              <IconButton 
                                size="small" 
                                color="error"
                                onClick={() => setDeleteDialog({ 
                                  open: true, 
                                  type: 'user', 
                                  id: user.id, 
                                  name: user.email 
                                })}
                              >
                                <Delete />
                              </IconButton>
                            </Tooltip>
                          </RequirePermission>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {filteredUsers.length === 0 && (
                <EmptyState message="No users found" />
              )}
            </>
          )}

          {/* Profiles Tab */}
          {tab === 1 && (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  System profiles cannot be deleted but their permissions can be modified.
                </Typography>
                <RequirePermission category="profiles" action="create">
                  <ActionButton icon={<Add />} onClick={() => openProfileDialog('create')}>
                    Add Profile
                  </ActionButton>
                </RequirePermission>
              </Box>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>Users</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {profiles.map(profile => (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <Typography fontWeight={500}>{profile.name}</Typography>
                        </TableCell>
                        <TableCell>{profile.description}</TableCell>
                        <TableCell>
                          <Chip label={profile.user_count || 0} size="small" />
                        </TableCell>
                        <TableCell>
                          {profile.is_system ? (
                            <Chip label="System" size="small" color="primary" icon={<Lock />} />
                          ) : (
                            <Chip label="Custom" size="small" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <RequirePermission category="profiles" action="edit">
                            <Tooltip title="Edit">
                              <IconButton size="small" onClick={() => openProfileDialog('edit', profile)}>
                                <Edit />
                              </IconButton>
                            </Tooltip>
                          </RequirePermission>
                          {!profile.is_system && (
                            <RequirePermission category="profiles" action="delete">
                              <Tooltip title="Delete">
                                <IconButton 
                                  size="small" 
                                  color="error"
                                  disabled={profile.user_count > 0}
                                  onClick={() => setDeleteDialog({ 
                                    open: true, 
                                    type: 'profile', 
                                    id: profile.id, 
                                    name: profile.name 
                                  })}
                                >
                                  <Delete />
                                </IconButton>
                              </Tooltip>
                            </RequirePermission>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {/* Login History Tab */}
          {tab === 2 && (
            <>
              {/* Stats Row */}
              {loginStats && (
                <StatsRow columns={4}>
                  <StatCard label="Total Attempts" value={loginStats.total_attempts} icon={<Login />} />
                  <StatCard label="Successful" value={loginStats.successful_logins} icon={<CheckCircle />} variant="success" />
                  <StatCard label="Failed" value={loginStats.failed_attempts} icon={<Warning />} variant="error" />
                  <StatCard 
                    label="Success Rate" 
                    value={loginStats.total_attempts > 0 ? Math.round((loginStats.successful_logins / loginStats.total_attempts) * 100) + '%' : '—'} 
                    icon={<Security />} 
                    variant="info" 
                  />
                </StatsRow>
              )}

              {/* Filters */}
              <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel>User</InputLabel>
                  <Select
                    value={historyFilter.userId}
                    label="User"
                    onChange={(e) => {
                      setHistoryFilter(prev => ({ ...prev, userId: e.target.value }));
                      setSelectedUserHistory(e.target.value ? users.find(u => u.id.toString() === e.target.value) : null);
                    }}
                  >
                    <MenuItem value="">All Users</MenuItem>
                    {users.map(user => (
                      <MenuItem key={user.id} value={user.id.toString()}>
                        {user.first_name} {user.last_name} ({user.email})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                
                <FormControl size="small" sx={{ minWidth: 130 }}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={historyFilter.success}
                    label="Status"
                    onChange={(e) => setHistoryFilter(prev => ({ ...prev, success: e.target.value }))}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="true">Successful</MenuItem>
                    <MenuItem value="false">Failed</MenuItem>
                  </Select>
                </FormControl>

                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Period</InputLabel>
                  <Select
                    value={historyFilter.days}
                    label="Period"
                    onChange={(e) => setHistoryFilter(prev => ({ ...prev, days: e.target.value }))}
                  >
                    <MenuItem value={7}>Last 7 days</MenuItem>
                    <MenuItem value={30}>Last 30 days</MenuItem>
                    <MenuItem value={90}>Last 90 days</MenuItem>
                  </Select>
                </FormControl>

                {(historyFilter.userId || historyFilter.success !== 'all') && (
                  <Tooltip title="Clear filters">
                    <IconButton 
                      size="small"
                      onClick={() => {
                        setHistoryFilter({ userId: '', success: 'all', days: historyFilter.days });
                        setSelectedUserHistory(null);
                      }}
                    >
                      <Clear />
                    </IconButton>
                  </Tooltip>
                )}

                <Box sx={{ flex: 1 }} />

                <ActionButton 
                  icon={<Refresh />} 
                  onClick={loadLoginHistory}
                  loading={historyLoading}
                  variant="outlined"
                  size="small"
                >
                  Refresh
                </ActionButton>
              </Box>

              {selectedUserHistory && (
                <Alert severity="info" sx={{ mb: 2 }} onClose={() => {
                  setHistoryFilter(prev => ({ ...prev, userId: '' }));
                  setSelectedUserHistory(null);
                }}>
                  Showing login history for <strong>{selectedUserHistory.first_name} {selectedUserHistory.last_name}</strong> ({selectedUserHistory.email})
                </Alert>
              )}

              {/* History Table */}
              {historyLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <Box className="ntx-spinner" />
                </Box>
              ) : loginHistory.length === 0 ? (
                <EmptyState message="No login history found" icon={<History />} />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date & Time</TableCell>
                        <TableCell>User</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Method</TableCell>
                        <TableCell>IP Address</TableCell>
                        <TableCell>Details</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loginHistory.map((entry, idx) => (
                        <TableRow key={idx} sx={{ 
                          backgroundColor: entry.success ? 'inherit' : 'rgba(211, 47, 47, 0.04)'
                        }}>
                          <TableCell>
                            <Typography variant="body2">
                              {new Date(entry.created_at).toLocaleDateString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(entry.created_at).toLocaleTimeString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{entry.user_name || entry.email}</Typography>
                            {entry.user_name && (
                              <Typography variant="caption" color="text.secondary">{entry.email}</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={entry.success ? 'Success' : 'Failed'}
                              size="small"
                              color={entry.success ? 'success' : 'error'}
                              icon={entry.success ? <CheckCircle /> : <Cancel />}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={entry.login_method || 'password'}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {entry.ip_address || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {entry.failure_reason && (
                              <Tooltip title={entry.failure_reason}>
                                <Chip 
                                  label={entry.failure_reason.replace(/_/g, ' ')}
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                />
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {loginHistory.length >= 200 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
                  Showing first 200 entries. Use filters to narrow down results.
                </Typography>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* User Dialog */}
      <Dialog open={userDialog.open} onClose={() => setUserDialog({ open: false, mode: 'create', user: null })} maxWidth="sm" fullWidth>
        <DialogTitle>
          {userDialog.mode === 'create' ? 'Create New User' : 'Edit User'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Email"
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              fullWidth
              required
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="First Name"
                value={userForm.firstName}
                onChange={(e) => setUserForm({ ...userForm, firstName: e.target.value })}
                fullWidth
              />
              <TextField
                label="Last Name"
                value={userForm.lastName}
                onChange={(e) => setUserForm({ ...userForm, lastName: e.target.value })}
                fullWidth
              />
            </Box>
            {userDialog.mode === 'create' && (
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                fullWidth
                required
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            )}
            <FormControl fullWidth>
              <InputLabel>Profile</InputLabel>
              <Select
                value={userForm.profileId}
                label="Profile"
                onChange={(e) => setUserForm({ ...userForm, profileId: e.target.value })}
              >
                {profiles.map(profile => (
                  <MenuItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {userDialog.mode === 'edit' && (
              <FormControlLabel
                control={
                  <Switch
                    checked={userForm.isActive}
                    onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })}
                  />
                }
                label="Active"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <ActionButton variant="text" onClick={() => setUserDialog({ open: false, mode: 'create', user: null })}>
            Cancel
          </ActionButton>
          <ActionButton icon={<Save />} onClick={handleSaveUser}>
            Save
          </ActionButton>
        </DialogActions>
      </Dialog>

      {/* Password Dialog */}
      <Dialog open={passwordDialog.open} onClose={() => setPasswordDialog({ open: false, userId: null })} maxWidth="xs" fullWidth>
        <DialogTitle>Change Password</DialogTitle>
        <DialogContent>
          <TextField
            label="New Password"
            type={showPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            fullWidth
            sx={{ mt: 1 }}
            helperText="Minimum 8 characters"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </DialogContent>
        <DialogActions>
          <ActionButton variant="text" onClick={() => { setPasswordDialog({ open: false, userId: null }); setNewPassword(''); }}>
            Cancel
          </ActionButton>
          <ActionButton icon={<Lock />} onClick={handleChangePassword} disabled={newPassword.length < 8}>
            Change Password
          </ActionButton>
        </DialogActions>
      </Dialog>

      {/* Profile Dialog */}
      <Dialog open={profileDialog.open} onClose={() => setProfileDialog({ open: false, mode: 'create', profile: null })} maxWidth="md" fullWidth>
        <DialogTitle>
          {profileDialog.mode === 'create' ? 'Create New Profile' : 'Edit Profile'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              fullWidth
              required
              disabled={profileDialog.profile?.is_system}
            />
            <TextField
              label="Description"
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Permissions</Typography>
            
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Category</TableCell>
                    {['View', 'Create', 'Edit', 'Delete', 'Other'].map(action => (
                      <TableCell key={action} align="center">{action}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {PERMISSION_CATEGORIES.map(cat => (
                    <TableRow key={cat.key}>
                      <TableCell>{cat.label}</TableCell>
                      {['view', 'create', 'edit', 'delete'].map(action => (
                        <TableCell key={action} align="center">
                          {cat.actions.includes(action) ? (
                            <Switch
                              size="small"
                              checked={profileForm.permissions[cat.key]?.[action] || false}
                              onChange={() => togglePermission(cat.key, action)}
                            />
                          ) : '—'}
                        </TableCell>
                      ))}
                      <TableCell align="center">
                        {cat.actions.filter(a => !['view', 'create', 'edit', 'delete'].includes(a)).map(action => (
                          <FormControlLabel
                            key={action}
                            control={
                              <Switch
                                size="small"
                                checked={profileForm.permissions[cat.key]?.[action] || false}
                                onChange={() => togglePermission(cat.key, action)}
                              />
                            }
                            label={action.replace(/_/g, ' ')}
                            sx={{ mr: 1 }}
                          />
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </DialogContent>
        <DialogActions>
          <ActionButton variant="text" onClick={() => setProfileDialog({ open: false, mode: 'create', profile: null })}>
            Cancel
          </ActionButton>
          <ActionButton icon={<Save />} onClick={handleSaveProfile}>
            Save
          </ActionButton>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, type: null, id: null, name: '' })}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {deleteDialog.type} <strong>{deleteDialog.name}</strong>?
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <ActionButton variant="text" onClick={() => setDeleteDialog({ open: false, type: null, id: null, name: '' })}>
            Cancel
          </ActionButton>
          <ActionButton 
            color="error" 
            icon={<Delete />} 
            onClick={deleteDialog.type === 'user' ? handleDeleteUser : handleDeleteProfile}
          >
            Delete
          </ActionButton>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default AdminUsers;
