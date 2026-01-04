/**
 * TopNavbar - Top navigation bar with search, stats, theme toggle, and user profile
 * Similar to JustDo dashboard design
 */
import React, { useState, useEffect } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  IconButton,
  InputBase,
  Badge,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Divider,
  Tooltip,
  Switch,
  Paper,
} from '@mui/material';
import {
  Search,
  Apps,
  Notifications,
  Mail,
  LightMode,
  DarkMode,
  AccountCircle,
  Settings,
  Logout,
  Help,
  Menu as MenuIcon,
} from '@mui/icons-material';
import './TopNavbar.css';

// Partner Network Logo
import PartnerNetworkLogo from '../assets/images/PartnerNetworkLogo_Horizontal.png';

// Theme storage key
const THEME_KEY = 'nintex_admin_theme';

const TopNavbar = ({ 
  user,
  onLogout, 
  onMenuToggle, 
  showMenuToggle = false,
  quickStats = [],
}) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_KEY) || 'light';
  });
  const [searchValue, setSearchValue] = useState('');
  const [profileAnchor, setProfileAnchor] = useState(null);
  const [notifAnchor, setNotifAnchor] = useState(null);

  // Get user initials
  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'A';
  };

  // Apply theme to document
  useEffect(() => {
    const adminHub = document.querySelector('.admin-hub');
    if (adminHub) {
      adminHub.classList.remove('light-theme', 'dark-theme');
      adminHub.classList.add(`${theme}-theme`);
    }
    localStorage.setItem(THEME_KEY, theme);
    // Dispatch custom event for same-tab listeners
    window.dispatchEvent(new Event('themeChange'));
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const handleProfileClick = (event) => {
    setProfileAnchor(event.currentTarget);
  };

  const handleProfileClose = () => {
    setProfileAnchor(null);
  };

  const handleNotifClick = (event) => {
    setNotifAnchor(event.currentTarget);
  };

  const handleNotifClose = () => {
    setNotifAnchor(null);
  };

  // Default quick stats if none provided
  const displayStats = quickStats.length > 0 ? quickStats : [
    { label: 'Partners', value: '—' },
    { label: 'Users', value: '—' },
    { label: 'Courses', value: '—' },
  ];

  return (
    <AppBar 
      position="fixed" 
      elevation={0}
      className="top-navbar"
      sx={{
        bgcolor: 'var(--admin-bg-card)',
        borderBottom: '1px solid var(--admin-border-default)',
        color: 'var(--admin-text-primary)',
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ minHeight: 64, px: { xs: 1, sm: 2 } }}>
        {/* Mobile Menu Toggle */}
        {showMenuToggle && (
          <IconButton
            onClick={onMenuToggle}
            sx={{ mr: 1, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
        )}

        {/* Logo Area - always visible */}
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          mr: 3,
        }}>
          <img 
            src={PartnerNetworkLogo} 
            alt="Nintex Partner Network" 
            style={{ height: 40, width: 'auto' }}
          />
        </Box>

        {/* Search Box */}
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            bgcolor: 'var(--admin-bg-elevated)',
            border: '1px solid var(--admin-border-light)',
            borderRadius: 2,
            px: 2,
            py: 0.5,
            width: { xs: 150, sm: 200, md: 280 },
            transition: 'all 0.2s',
            '&:focus-within': {
              borderColor: 'var(--nintex-orange)',
              boxShadow: '0 0 0 2px rgba(255, 107, 53, 0.1)',
            },
          }}
        >
          <Search sx={{ color: 'var(--admin-text-muted)', mr: 1, fontSize: 20 }} />
          <InputBase
            placeholder="Search..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            sx={{ 
              flex: 1, 
              fontSize: '0.875rem',
              '& input': { p: 0 },
            }}
          />
        </Paper>

        {/* Spacer */}
        <Box sx={{ flex: 1 }} />

        {/* Quick Stats - Desktop only */}
        <Box sx={{ 
          display: { xs: 'none', lg: 'flex' }, 
          alignItems: 'center',
          gap: 4,
          mr: 4,
        }}>
          {displayStats.map((stat, idx) => (
            <Box key={idx} sx={{ textAlign: 'center' }}>
              <Typography 
                variant="subtitle2" 
                sx={{ 
                  fontWeight: 700, 
                  color: 'var(--admin-text-primary)',
                  fontSize: '1rem',
                }}
              >
                {stat.value}
              </Typography>
              <Typography 
                variant="caption" 
                sx={{ color: 'var(--admin-text-muted)' }}
              >
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Action Icons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {/* Theme Toggle */}
          <Tooltip title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            <IconButton onClick={toggleTheme} sx={{ color: 'var(--admin-text-secondary)' }}>
              {theme === 'light' ? <DarkMode /> : <LightMode />}
            </IconButton>
          </Tooltip>

          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton 
              onClick={handleNotifClick}
              sx={{ color: 'var(--admin-text-secondary)' }}
            >
              <Badge badgeContent={0} color="error">
                <Notifications />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Messages */}
          <Tooltip title="Messages">
            <IconButton sx={{ color: 'var(--admin-text-secondary)', display: { xs: 'none', sm: 'flex' } }}>
              <Badge badgeContent={0} color="primary">
                <Mail />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* Divider */}
          <Divider orientation="vertical" flexItem sx={{ mx: 1, display: { xs: 'none', sm: 'block' } }} />

          {/* User Profile */}
          <IconButton onClick={handleProfileClick} sx={{ p: 0.5 }}>
            <Avatar 
              sx={{ 
                width: 36, 
                height: 36, 
                bgcolor: 'var(--nintex-orange)',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              {getUserInitials()}
            </Avatar>
          </IconButton>
        </Box>

        {/* Profile Menu */}
        <Menu
          anchorEl={profileAnchor}
          open={Boolean(profileAnchor)}
          onClose={handleProfileClose}
          PaperProps={{
            sx: {
              mt: 1,
              minWidth: 200,
              bgcolor: 'var(--admin-bg-card)',
              border: '1px solid var(--admin-border-default)',
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {user?.firstName} {user?.lastName}
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--admin-text-muted)' }}>
              {user?.email || 'admin@nintex.com'}
            </Typography>
            {user?.profileName && (
              <Typography variant="caption" sx={{ display: 'block', color: 'var(--nintex-orange)', mt: 0.5 }}>
                {user.profileName}
              </Typography>
            )}
          </Box>
          <Divider />
          <MenuItem onClick={handleProfileClose}>
            <ListItemIcon>
              <AccountCircle fontSize="small" />
            </ListItemIcon>
            <ListItemText>Profile</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleProfileClose}>
            <ListItemIcon>
              <Settings fontSize="small" />
            </ListItemIcon>
            <ListItemText>Settings</ListItemText>
          </MenuItem>
          <MenuItem onClick={handleProfileClose}>
            <ListItemIcon>
              <Help fontSize="small" />
            </ListItemIcon>
            <ListItemText>Help Center</ListItemText>
          </MenuItem>
          <Divider />
          <MenuItem 
            onClick={() => { handleProfileClose(); onLogout?.(); }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon>
              <Logout fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Logout</ListItemText>
          </MenuItem>
        </Menu>

        {/* Notifications Menu */}
        <Menu
          anchorEl={notifAnchor}
          open={Boolean(notifAnchor)}
          onClose={handleNotifClose}
          PaperProps={{
            sx: {
              mt: 1,
              minWidth: 300,
              maxHeight: 400,
              bgcolor: 'var(--admin-bg-card)',
              border: '1px solid var(--admin-border-default)',
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Notifications
            </Typography>
            <Typography variant="caption" sx={{ color: 'var(--nintex-orange)', cursor: 'pointer' }}>
              Mark all read
            </Typography>
          </Box>
          <Divider />
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'var(--admin-text-muted)' }}>
              No new notifications
            </Typography>
          </Box>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default TopNavbar;
