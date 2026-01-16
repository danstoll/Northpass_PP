import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  TextField, 
  Typography, 
  Alert,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  InputAdornment,
  IconButton,
  Link,
  Divider,
} from '@mui/material';
import {
  Lock,
  LockOpen,
  Visibility,
  VisibilityOff,
  Storage,
  Sync,
  Assessment,
  GroupWork,
  PersonAdd,
  Build,
  Dashboard,
  People,
  Security,
  Email,
  ArrowBack,
} from '@mui/icons-material';
import AdminNav from './AdminNav';
import TopNavbar from './TopNavbar';
import { ActionButton } from './ui/NintexUI';
import { useAuth } from '../context/AuthContext';
import './AdminHub.css';

// Theme storage key  
const THEME_KEY = 'nintex_admin_theme';

// API base URL for database operations
const API_BASE = '/api/db';

const AdminHub = ({ children, currentPage }) => {
  const { user, isAuthenticated, loading: authLoading, login, logout, error: authError } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  
  // Login mode: 'password' | 'forgot' | 'magic'
  const [loginMode, setLoginMode] = useState('password');
  const [successMessage, setSuccessMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  
  const [quickStats, setQuickStats] = useState([
    { label: 'Partners', value: '—' },
    { label: 'Users', value: '—' },
    { label: 'Courses', value: '—' },
  ]);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem(THEME_KEY) || 'light';
  });

  // Listen for theme changes from TopNavbar
  useEffect(() => {
    const handleStorageChange = () => {
      const newTheme = localStorage.getItem(THEME_KEY) || 'light';
      setTheme(newTheme);
    };
    
    window.addEventListener('themeChange', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('themeChange', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Fetch quick stats when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_BASE}/stats`);
        if (response.ok) {
          const data = await response.json();
          setQuickStats([
            { label: 'Partners', value: data.partners?.toLocaleString() || '0' },
            { label: 'Users', value: data.lmsUsers?.toLocaleString() || '0' },
            { label: 'Courses', value: data.lmsCourses?.toLocaleString() || '0' },
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };
    
    fetchStats();
    const interval = setInterval(fetchStats, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    
    const result = await login(email, password);
    
    if (!result.success) {
      setLoginError(result.error || 'Login failed');
    }
    
    setLoggingIn(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSuccessMessage('');
    setSendingEmail(true);
    
    try {
      const response = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage('If an account exists with this email, you will receive a password reset link shortly.');
        setEmail('');
      } else {
        setLoginError(data.error || 'Failed to send reset email');
      }
    } catch (error) {
      setLoginError('Network error. Please try again.');
    }
    
    setSendingEmail(false);
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setLoginError('');
    setSuccessMessage('');
    setSendingEmail(true);
    
    try {
      const response = await fetch(`${API_BASE}/auth/magic-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccessMessage('If an account exists with this email, you will receive a sign-in link shortly.');
        setEmail('');
      } else {
        setLoginError(data.error || 'Failed to send magic link');
      }
    } catch (error) {
      setLoginError('Network error. Please try again.');
    }
    
    setSendingEmail(false);
  };

  const switchToPasswordLogin = () => {
    setLoginMode('password');
    setLoginError('');
    setSuccessMessage('');
  };

  const handleLogout = async () => {
    await logout();
  };

  const adminTools = [
    { icon: <Storage />, name: 'Data Management', desc: 'Import partner contact data from Excel' },
    { icon: <Sync />, name: 'LMS Sync', desc: 'Sync enrollment data with progress tracking' },
    { icon: <Assessment />, name: 'Reports', desc: 'Analytics by Region, Tier & Certification gaps' },
    { icon: <Dashboard />, name: 'Owner Report', desc: 'View accounts by owner with dashboard URLs' },
    { icon: <GroupWork />, name: 'Group Analysis', desc: 'Manage LMS groups and partner matching' },
    { icon: <PersonAdd />, name: 'User Management', desc: 'Add missing CRM contacts to LMS' },
    { icon: <Build />, name: 'Maintenance', desc: 'Fix group membership issues' },
    { icon: <People />, name: 'Admin Users', desc: 'Manage admin user accounts' },
    { icon: <Security />, name: 'Profiles', desc: 'Configure role-based permissions' },
  ];

  // Loading state
  if (authLoading) {
    return (
      <div className="admin-hub">
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '100vh',
          }}
        >
          <Typography>Loading...</Typography>
        </Box>
      </div>
    );
  }

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="admin-hub">
        <Box 
          sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            minHeight: '100vh',
            p: 3,
          }}
        >
          <Card sx={{ maxWidth: 500, width: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              {/* Header */}
              <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Lock sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                <Typography variant="h1" sx={{ color: 'primary.main', mb: 1 }}>
                  Admin Portal
                </Typography>
                <Typography variant="body2" sx={{ opacity: 0.7 }}>
                  {loginMode === 'password' && 'Sign in to access the Nintex Partner Portal administration tools.'}
                  {loginMode === 'forgot' && 'Enter your email to receive a password reset link.'}
                  {loginMode === 'magic' && 'Enter your email to receive a sign-in link.'}
                </Typography>
              </Box>

              {/* Success Message */}
              {successMessage && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  {successMessage}
                </Alert>
              )}

              {/* Error Message */}
              {(loginError || authError) && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {loginError || authError}
                </Alert>
              )}

              {/* Password Login Form */}
              {loginMode === 'password' && (
                <form onSubmit={handleLogin} autoComplete="on">
                  <TextField
                    fullWidth
                    id="admin-email"
                    name="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@nintex.com"
                    autoComplete="username email"
                    autoFocus
                    required
                    sx={{ mb: 2 }}
                  />
                  
                  <TextField
                    fullWidth
                    id="admin-password"
                    name="password"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    sx={{ mb: 2 }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                              onClick={() => setShowPassword(!showPassword)}
                              onMouseDown={(e) => e.preventDefault()}
                              edge="end"
                              tabIndex={-1}
                            >
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  
                  <ActionButton 
                    type="submit" 
                    fullWidth 
                    loading={loggingIn}
                    icon={<LockOpen />}
                    sx={{ mb: 2 }}
                    disabled={!email || !password}
                  >
                    Sign In
                  </ActionButton>

                  {/* Forgot Password & Magic Link Links */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      onClick={() => { setLoginMode('forgot'); setLoginError(''); setSuccessMessage(''); }}
                      sx={{ cursor: 'pointer' }}
                    >
                      Forgot password?
                    </Link>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      onClick={() => { setLoginMode('magic'); setLoginError(''); setSuccessMessage(''); }}
                      sx={{ cursor: 'pointer' }}
                    >
                      Sign in with email link
                    </Link>
                  </Box>
                </form>
              )}

              {/* Forgot Password Form */}
              {loginMode === 'forgot' && (
                <form onSubmit={handleForgotPassword}>
                  <TextField
                    fullWidth
                    id="reset-email"
                    name="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@nintex.com"
                    autoComplete="email"
                    autoFocus
                    required
                    sx={{ mb: 2 }}
                  />
                  
                  <ActionButton 
                    type="submit" 
                    fullWidth 
                    loading={sendingEmail}
                    icon={<Email />}
                    sx={{ mb: 2 }}
                    disabled={!email}
                  >
                    Send Reset Link
                  </ActionButton>

                  <Box sx={{ textAlign: 'center' }}>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      onClick={switchToPasswordLogin}
                      sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <ArrowBack fontSize="small" />
                      Back to sign in
                    </Link>
                  </Box>
                </form>
              )}

              {/* Magic Link Form */}
              {loginMode === 'magic' && (
                <form onSubmit={handleMagicLink}>
                  <TextField
                    fullWidth
                    id="magic-email"
                    name="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@nintex.com"
                    autoComplete="email"
                    autoFocus
                    required
                    sx={{ mb: 2 }}
                  />
                  
                  <ActionButton 
                    type="submit" 
                    fullWidth 
                    loading={sendingEmail}
                    icon={<Email />}
                    variant="secondary"
                    sx={{ mb: 2 }}
                    disabled={!email}
                  >
                    Send Magic Link
                  </ActionButton>

                  <Box sx={{ textAlign: 'center' }}>
                    <Link
                      component="button"
                      type="button"
                      variant="body2"
                      onClick={switchToPasswordLogin}
                      sx={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 0.5 }}
                    >
                      <ArrowBack fontSize="small" />
                      Back to sign in
                    </Link>
                  </Box>
                </form>
              )}

              <Divider sx={{ my: 3 }} />

              {/* Tools Preview */}
              <Box>
                <Typography 
                  variant="overline" 
                  sx={{ 
                    display: 'block', 
                    mb: 1, 
                    opacity: 0.6,
                    letterSpacing: 1,
                  }}
                >
                  Available Tools
                </Typography>
                <List dense sx={{ 
                  bgcolor: 'rgba(255,255,255,0.03)', 
                  borderRadius: 2,
                  maxHeight: 280,
                  overflow: 'auto',
                }}>
                  {adminTools.map((tool, idx) => (
                    <ListItem key={idx} sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 36, color: 'primary.main' }}>
                        {tool.icon}
                      </ListItemIcon>
                      <ListItemText 
                        primary={tool.name}
                        secondary={tool.desc}
                        primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                        secondaryTypographyProps={{ variant: 'caption' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </div>
    );
  }

  // Authenticated view with navigation and children
  return (
    <div className={`admin-hub authenticated ${theme}-theme`}>
      <TopNavbar 
        user={user}
        onLogout={handleLogout}
        onMenuToggle={() => setMobileNavOpen(!mobileNavOpen)}
        showMenuToggle={true}
        quickStats={quickStats}
      />
      <div className="admin-layout">
        <AdminNav 
          currentPage={currentPage} 
          onLogout={handleLogout}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
        <div className="admin-content">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AdminHub;
