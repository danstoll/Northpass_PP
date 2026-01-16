import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  Lock,
  CheckCircle,
  Error as ErrorIcon,
  Email,
} from '@mui/icons-material';
import { ActionButton } from './ui/NintexUI';

const API_BASE = '/api/db';
const TOKEN_KEY = 'nintex_admin_token';
const USER_KEY = 'nintex_admin_user';

const MagicLogin = () => {
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  const loginWithToken = useCallback(async (token) => {
    try {
      const response = await fetch(`${API_BASE}/auth/magic-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store auth data in localStorage (same as regular login)
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        
        setUser(data.user);
        setStatus('success');
        
        // Redirect to admin after a short delay
        setTimeout(() => {
          window.location.href = '/admin';
        }, 2000);
      } else {
        setStatus('error');
        setError(data.error || 'Invalid or expired magic link');
      }
    } catch {
      setStatus('error');
      setError('Network error. Please try again.');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (token) {
      loginWithToken(token);
    } else {
      setStatus('error');
      setError('No magic link token provided');
    }
  }, [loginWithToken]);

  // Loading state
  if (status === 'loading') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          p: 3,
          bgcolor: 'background.default',
        }}
      >
        <Card sx={{ maxWidth: 450, width: '100%' }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              Signing you in...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Please wait while we verify your magic link.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          p: 3,
          bgcolor: 'background.default',
        }}
      >
        <Card sx={{ maxWidth: 450, width: '100%' }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
            <Typography variant="h5" gutterBottom fontWeight="bold">
              Welcome Back{user?.firstName ? `, ${user.firstName}` : ''}!
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              You've been signed in successfully. Redirecting to the admin portal...
            </Typography>
            <CircularProgress size={24} />
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Error state
  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Card sx={{ maxWidth: 450, width: '100%' }}>
        <CardContent sx={{ p: 4, textAlign: 'center' }}>
          <ErrorIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
          <Typography variant="h5" gutterBottom fontWeight="bold">
            Sign In Failed
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            {error || 'This magic link is invalid or has expired.'}
          </Typography>
          
          <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
            Magic links expire after 15 minutes for security. Please request a new link if needed.
          </Alert>
          
          <Box sx={{ display: 'flex', gap: 2, flexDirection: 'column' }}>
            <ActionButton
              fullWidth
              onClick={() => window.location.href = '/admin'}
              icon={<Lock />}
            >
              Go to Sign In
            </ActionButton>
            <ActionButton
              fullWidth
              variant="secondary"
              onClick={() => {
                // Go back to login with magic link mode selected
                window.location.href = '/admin';
              }}
              icon={<Email />}
            >
              Request New Magic Link
            </ActionButton>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default MagicLogin;
