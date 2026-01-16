import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
} from '@mui/material';
import {
  Lock,
  LockReset,
  Visibility,
  VisibilityOff,
  CheckCircle,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { ActionButton } from './ui/NintexUI';

const API_BASE = '/api/db';

const ResetPassword = () => {
  const [token, setToken] = useState('');
  const [tokenValid, setTokenValid] = useState(null); // null = loading, true = valid, false = invalid
  const [userInfo, setUserInfo] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Extract token from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      setToken(urlToken);
      validateToken(urlToken);
    } else {
      setTokenValid(false);
      setError('No reset token provided');
    }
  }, []);

  const validateToken = async (tokenToValidate) => {
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password/${tokenToValidate}`);
      const data = await response.json();

      if (response.ok && data.valid) {
        setTokenValid(true);
        setUserInfo(data);
      } else {
        setTokenValid(false);
        setError(data.error || 'Invalid or expired reset link');
      }
    } catch (err) {
      setTokenValid(false);
      setError('Failed to validate reset link');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setResetting(true);

    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    }

    setResetting(false);
  };

  // Success state
  if (success) {
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
              Password Reset Successfully
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Your password has been changed. You can now sign in with your new password.
            </Typography>
            <ActionButton
              fullWidth
              onClick={() => window.location.href = '/admin'}
              icon={<Lock />}
            >
              Go to Sign In
            </ActionButton>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Loading state
  if (tokenValid === null) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          p: 3,
        }}
      >
        <Card sx={{ maxWidth: 450, width: '100%' }}>
          <CardContent sx={{ p: 4, textAlign: 'center' }}>
            <CircularProgress size={48} sx={{ mb: 2 }} />
            <Typography variant="body1">Validating reset link...</Typography>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Invalid token state
  if (tokenValid === false) {
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
              Invalid Reset Link
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              {error || 'This password reset link is invalid or has expired.'}
            </Typography>
            <ActionButton
              fullWidth
              onClick={() => window.location.href = '/admin'}
              icon={<Lock />}
            >
              Back to Sign In
            </ActionButton>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Valid token - show password reset form
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
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <LockReset sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
            <Typography variant="h5" fontWeight="bold" gutterBottom>
              Reset Your Password
            </Typography>
            {userInfo?.firstName && (
              <Typography variant="body2" color="text.secondary">
                Hi {userInfo.firstName}, enter your new password below.
              </Typography>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoFocus
              sx={{ mb: 2 }}
              helperText="At least 8 characters"
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />

            <TextField
              fullWidth
              label="Confirm Password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              sx={{ mb: 3 }}
              error={confirmPassword && newPassword !== confirmPassword}
              helperText={confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match' : ''}
            />

            <ActionButton
              type="submit"
              fullWidth
              loading={resetting}
              icon={<LockReset />}
              disabled={!newPassword || !confirmPassword || newPassword !== confirmPassword}
            >
              Reset Password
            </ActionButton>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default ResetPassword;
