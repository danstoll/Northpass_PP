import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Typography,
  Divider,
  useTheme,
  useMediaQuery,
  Select,
  MenuItem,
  FormControl,
  Alert,
  Chip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Close as CloseIcon,
  Storage,
  Sync,
  Assessment,
  Dashboard,
  PersonAdd,
  Home,
  Logout,
  Bolt,
  People,
  Security,
  FormatListBulleted,
  Settings,
  SwapHoriz,
  ExitToApp,
  Timeline,
  SupervisorAccount,
  GroupWork,
  School,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';

const DRAWER_WIDTH = 240;

// Navigation sections with grouped items
// permission: { category, action } - both must be true to show
// If permission is null, always show
const NAV_SECTIONS = [
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: <Timeline />, permission: { category: 'reports', action: 'view' } },
      { id: 'dbreports', label: 'Reports', path: '/admin/dbreports', icon: <Assessment />, permission: { category: 'reports', action: 'view' } },
      { id: 'owners', label: 'Owner Report', path: '/admin/owners', icon: <Dashboard />, permission: { category: 'reports', action: 'view' } },
    ]
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { id: 'users', label: 'User Management', path: '/admin/users', icon: <PersonAdd />, permission: { category: 'user_management', action: 'view' } },
      { id: 'pam', label: 'PAM Management', path: '/admin/pam', icon: <SupervisorAccount />, permission: { category: 'user_management', action: 'view' } },
      { id: 'groups', label: 'Group Management', path: '/admin/groups', icon: <GroupWork />, permission: { category: 'user_management', action: 'view' } },
      { id: 'certifications', label: 'Certifications', path: '/admin/certifications', icon: <School />, permission: { category: 'data_management', action: 'view' } },
    ]
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { id: 'data', label: 'Data Management', path: '/admin/data', icon: <Storage />, permission: { category: 'data_management', action: 'view' } },
      { id: 'sync-dashboard', label: 'LMS Sync', path: '/admin/sync-dashboard', icon: <Sync />, permission: { category: 'data_management', action: 'sync' } },
      { id: 'settings', label: 'Settings', path: '/admin/settings', icon: <Settings />, permission: { category: 'settings', action: 'view' } },
      { id: 'admin-users', label: 'Admin Users', path: '/admin/admin-users', icon: <People />, permission: { category: 'users', action: 'view' } },
    ]
  },
];

const AdminNav = ({ currentPage, onLogout, mobileOpen, onMobileClose }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { 
    realUser, 
    isImpersonating, 
    impersonatedUser,
    startImpersonation, 
    stopImpersonation,
    hasPermission,
    authFetch 
  } = useAuth();
  
  const [adminUsers, setAdminUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Use realUser permissions for impersonation capability (admins only)
  const canImpersonate = realUser?.permissions?.users?.view;
  
  // Filter nav sections based on current user's permissions (respects impersonation)
  const filteredSections = useMemo(() => {
    return NAV_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item => {
        // No permission required - always show
        if (!item.permission) return true;
        // Check if user has the required permission
        return hasPermission(item.permission.category, item.permission.action);
      })
    })).filter(section => section.items.length > 0); // Remove empty sections
  }, [hasPermission]);
  
  // Fetch admin users for impersonation dropdown
  useEffect(() => {
    if (canImpersonate && !isImpersonating) {
      loadAdminUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canImpersonate, isImpersonating]);
  
  const loadAdminUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await authFetch('/api/db/admin/users');
      if (response.ok) {
        const users = await response.json();
        setAdminUsers(users);
      }
    } catch (err) {
      console.error('Failed to load admin users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };
  
  const handleImpersonate = (event) => {
    const userId = event.target.value;
    if (!userId) return;
    
    const targetUser = adminUsers.find(u => u.id === parseInt(userId));
    if (targetUser) {
      // Parse permissions if it's a string
      const permissions = typeof targetUser.permissions === 'string' 
        ? JSON.parse(targetUser.permissions) 
        : targetUser.permissions;
      
      startImpersonation({
        id: targetUser.id,
        email: targetUser.email,
        first_name: targetUser.first_name,
        last_name: targetUser.last_name,
        profile_name: targetUser.profile_name,
        permissions
      });
    }
  };

  const handleNavClick = (path) => {
    onMobileClose?.();
    window.location.href = path;
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Impersonation Banner */}
      {isImpersonating && (
        <Alert 
          severity="warning" 
          icon={<SwapHoriz />}
          sx={{ 
            borderRadius: 0,
            py: 0.5,
            '& .MuiAlert-message': { width: '100%' }
          }}
          action={
            <IconButton 
              size="small" 
              onClick={stopImpersonation}
              title="Stop impersonating"
            >
              <ExitToApp fontSize="small" />
            </IconButton>
          }
        >
          <Typography variant="caption" sx={{ fontWeight: 600 }}>
            Viewing as: {impersonatedUser?.first_name} {impersonatedUser?.last_name}
          </Typography>
          <Typography variant="caption" display="block" sx={{ opacity: 0.8 }}>
            {impersonatedUser?.profile_name}
          </Typography>
        </Alert>
      )}
      
      {/* Brand */}
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1.5,
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Typography variant="subtitle1" sx={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>
          Admin Portal
        </Typography>
        {isMobile && (
          <IconButton 
            onClick={onMobileClose} 
            sx={{ ml: 'auto', color: 'text.secondary' }}
          >
            <CloseIcon />
          </IconButton>
        )}
      </Box>
      
      {/* Impersonation Selector (only for admins) */}
      {canImpersonate && !isImpersonating && (
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', mb: 0.5, display: 'block' }}>
            <SwapHoriz sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
            View as User
          </Typography>
          <FormControl fullWidth size="small">
            <Select
              value=""
              onChange={handleImpersonate}
              displayEmpty
              sx={{
                bgcolor: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.9)',
                '& .MuiSelect-icon': { color: 'rgba(255,255,255,0.5)' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.3)' },
                fontSize: '0.8rem',
              }}
            >
              <MenuItem value="" disabled>
                <em>{loadingUsers ? 'Loading...' : 'Select user to impersonate'}</em>
              </MenuItem>
              {adminUsers
                .filter(u => u.id !== realUser?.id) // Exclude current user
                .map(adminUser => (
                  <MenuItem key={adminUser.id} value={adminUser.id}>
                    <Box>
                      <Typography variant="body2">
                        {adminUser.first_name} {adminUser.last_name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {adminUser.profile_name} • {adminUser.email}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))
              }
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Navigation Links - Grouped by Section */}
      <List sx={{ flex: 1, py: 1, overflowY: 'auto' }}>
        {filteredSections.map((section, sectionIndex) => (
          <Box key={section.id}>
            {/* Section Header */}
            <Typography
              variant="overline"
              sx={{
                px: 2,
                pt: sectionIndex === 0 ? 1 : 2,
                pb: 0.5,
                display: 'block',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '0.65rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
              }}
            >
              {section.label}
            </Typography>
            
            {/* Section Items */}
            {section.items.map((item) => (
              <ListItem key={item.id} disablePadding sx={{ px: 1 }}>
                <ListItemButton
                  onClick={() => handleNavClick(item.path)}
                  selected={currentPage === item.id}
                  sx={{
                    borderRadius: 1,
                    mb: 0.5,
                    py: 0.75,
                    '&.Mui-selected': {
                      bgcolor: 'rgba(255, 107, 53, 0.15)',
                      '&:hover': {
                        bgcolor: 'rgba(255, 107, 53, 0.25)',
                      },
                      '& .MuiListItemIcon-root': {
                        color: 'primary.main',
                      },
                      '& .MuiListItemText-primary': {
                        color: 'primary.main',
                        fontWeight: 600,
                      },
                    },
                    '&:hover': {
                      bgcolor: 'rgba(255, 255, 255, 0.05)',
                    },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText 
                    primary={item.label}
                    primaryTypographyProps={{ 
                      variant: 'body2',
                      noWrap: true,
                      fontSize: '0.85rem',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </Box>
        ))}
      </List>

      {/* Bottom Actions */}
      <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <List sx={{ py: 1 }}>
          <ListItem disablePadding sx={{ px: 1 }}>
            <ListItemButton
              onClick={() => handleNavClick('/')}
              sx={{ borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
                <Home />
              </ListItemIcon>
              <ListItemText 
                primary="Portal"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItemButton>
          </ListItem>
          {onLogout && (
            <ListItem disablePadding sx={{ px: 1 }}>
              <ListItemButton
                onClick={onLogout}
                sx={{ 
                  borderRadius: 1,
                  '&:hover': {
                    bgcolor: 'rgba(255, 82, 82, 0.1)',
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: 'error.main' }}>
                  <Logout />
                </ListItemIcon>
                <ListItemText 
                  primary="Logout"
                  primaryTypographyProps={{ variant: 'body2', color: 'error.main' }}
                />
              </ListItemButton>
            </ListItem>
          )}
        </List>
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile Drawer */}
      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
            borderRight: '1px solid rgba(255,255,255,0.1)',
            top: 64, // Below the top navbar
            height: 'calc(100% - 64px)',
            color: 'rgba(255,255,255,0.9)',
          },
        }}
      >
        {drawerContent}
      </Drawer>
    </>
  );
};

export default AdminNav;
