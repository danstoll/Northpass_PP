/**
 * AuthContext - Authentication and Authorization Context
 * Provides user authentication state, permission checking, and user impersonation
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

// Storage keys
const TOKEN_KEY = 'nintex_admin_token';
const USER_KEY = 'nintex_admin_user';
const IMPERSONATION_KEY = 'nintex_impersonated_user';

// API base URL
const API_BASE = '/api/db';

/**
 * Auth Provider Component
 */
export function AuthProvider({ children }) {
  const [realUser, setRealUser] = useState(null); // The actual logged-in admin
  const [impersonatedUser, setImpersonatedUser] = useState(null); // The user being impersonated
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // The effective user (impersonated or real)
  const user = impersonatedUser || realUser;
  const isImpersonating = !!impersonatedUser;

  /**
   * Initialize auth state from storage
   */
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    const storedImpersonation = sessionStorage.getItem(IMPERSONATION_KEY);
    
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setRealUser(parsedUser);
        
        // Restore impersonation if active
        if (storedImpersonation) {
          try {
            const parsedImpersonation = JSON.parse(storedImpersonation);
            setImpersonatedUser(parsedImpersonation);
          } catch {
            sessionStorage.removeItem(IMPERSONATION_KEY);
          }
        }
        
        // Validate session with backend
        validateStoredSession(storedToken);
      } catch {
        clearAuth();
      }
    }
    
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Validate stored session with backend
   */
  const validateStoredSession = async (authToken) => {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        clearAuth();
        return;
      }
      
      const data = await response.json();
      setRealUser(data.user);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    } catch (err) {
      // Network error - keep local session for now
      console.warn('Session validation failed:', err.message);
    }
  };

  /**
   * Login with email and password
   */
  const login = useCallback(async (email, password) => {
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }
      
      // Store auth data
      setToken(data.token);
      setRealUser(data.user);
      setImpersonatedUser(null); // Clear any impersonation
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      sessionStorage.removeItem(IMPERSONATION_KEY);
      
      return { success: true, user: data.user };
    } catch (err) {
      setError(err.message);
      return { success: false, error: err.message };
    }
  }, []);

  /**
   * Logout
   */
  const logout = useCallback(async () => {
    try {
      if (token) {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch {
      // Ignore logout errors
    }
    
    clearAuth();
  }, [token]);

  /**
   * Clear auth state and storage
   */
  const clearAuth = () => {
    setToken(null);
    setRealUser(null);
    setImpersonatedUser(null);
    setError(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(IMPERSONATION_KEY);
  };

  /**
   * Start impersonating a user
   */
  const startImpersonation = useCallback((targetUser) => {
    // Only admins can impersonate
    if (!realUser?.permissions?.users?.view) {
      console.warn('User does not have permission to impersonate');
      return false;
    }
    
    setImpersonatedUser(targetUser);
    sessionStorage.setItem(IMPERSONATION_KEY, JSON.stringify(targetUser));
    return true;
  }, [realUser]);

  /**
   * Stop impersonating and return to real user
   */
  const stopImpersonation = useCallback(() => {
    setImpersonatedUser(null);
    sessionStorage.removeItem(IMPERSONATION_KEY);
  }, []);

  /**
   * Check if user has specific permission (uses effective user)
   */
  const hasPermission = useCallback((category, action) => {
    if (!user?.permissions) return false;
    return user.permissions[category]?.[action] === true;
  }, [user]);

  /**
   * Check if user has any of the specified permissions
   */
  const hasAnyPermission = useCallback((checks) => {
    if (!user?.permissions) return false;
    return checks.some(([category, action]) => user.permissions[category]?.[action] === true);
  }, [user]);

  /**
   * Check if user has all of the specified permissions
   */
  const hasAllPermissions = useCallback((checks) => {
    if (!user?.permissions) return false;
    return checks.every(([category, action]) => user.permissions[category]?.[action] === true);
  }, [user]);

  /**
   * Check if REAL user (not impersonated) has permission
   * Used for actions that should always use real admin permissions
   */
  const realUserHasPermission = useCallback((category, action) => {
    if (!realUser?.permissions) return false;
    return realUser.permissions[category]?.[action] === true;
  }, [realUser]);

  /**
   * Get authorization header for API calls
   */
  const getAuthHeader = useCallback(() => {
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }, [token]);

  /**
   * Make authenticated API request
   */
  const authFetch = useCallback(async (url, options = {}) => {
    const headers = {
      ...options.headers,
      ...getAuthHeader()
    };
    
    const response = await fetch(url, { ...options, headers });
    
    // Handle 401 - session expired
    if (response.status === 401) {
      clearAuth();
      throw new Error('Session expired. Please log in again.');
    }
    
    return response;
  }, [getAuthHeader]);

  const value = {
    // State
    user, // Effective user (impersonated or real)
    realUser, // Always the actual logged-in user
    token,
    loading,
    error,
    isAuthenticated: !!realUser,
    
    // Impersonation
    isImpersonating,
    impersonatedUser,
    startImpersonation,
    stopImpersonation,
    
    // Actions
    login,
    logout,
    
    // Permission helpers
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    realUserHasPermission,
    
    // API helpers
    getAuthHeader,
    authFetch
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Higher-order component to require authentication
 */
export function withAuth(WrappedComponent) {
  return function AuthenticatedComponent(props) {
    const { isAuthenticated, loading } = useAuth();
    
    if (loading) {
      return <div>Loading...</div>;
    }
    
    if (!isAuthenticated) {
      return null; // Let parent handle redirect/login
    }
    
    return <WrappedComponent {...props} />;
  };
}

/**
 * Component to conditionally render based on permission
 */
export function RequirePermission({ category, action, children, fallback = null }) {
  const { hasPermission, isAuthenticated } = useAuth();
  
  if (!isAuthenticated) return fallback;
  if (!hasPermission(category, action)) return fallback;
  
  return children;
}

export default AuthContext;
