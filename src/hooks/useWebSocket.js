import { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

// Singleton socket instance
let socket = null;
let connectionCount = 0;

// WebSocket is DISABLED in production because the reverse proxy doesn't support WSS
// The dashboard uses auto-refresh polling instead (every 2-10 seconds)
const WS_ENABLED = !import.meta.env.PROD; // Only enable in development

const WS_URL = 'http://localhost:3000'; // Only used in development

function getSocket() {
  if (!WS_ENABLED) {
    return null; // WebSocket disabled in production
  }
  
  if (!socket) {
    console.log('🔌 Connecting to WebSocket at:', WS_URL);
    
    socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

/**
 * Hook to subscribe to real-time sync updates
 * @param {string[]} syncTypes - Array of sync types to subscribe to (e.g., ['users', 'groups', 'courses'])
 * @returns {object} - { connected, lastUpdate, progress, subscribe, unsubscribe }
 */
export function useSyncSocket(syncTypes = []) {
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [progress, setProgress] = useState({});
  const [completedSyncs, setCompletedSyncs] = useState([]);
  const [errors, setErrors] = useState([]);
  const subscribedRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    
    // If WebSocket is not available (HTTPS mixed content issue), skip
    if (!socket) {
      console.log('⚠️ WebSocket not available, using polling instead');
      return;
    }
    
    connectionCount++;

    const handleConnect = () => {
      console.log('🔌 WebSocket connected');
      setConnected(true);
      
      // Subscribe to sync types
      if (syncTypes.length > 0 && !subscribedRef.current) {
        socket.emit('sync:subscribe', syncTypes);
        subscribedRef.current = true;
      }
    };

    const handleDisconnect = () => {
      console.log('🔌 WebSocket disconnected');
      setConnected(false);
      subscribedRef.current = false;
    };

    const handleProgress = (data) => {
      console.log('📊 Sync progress:', data);
      setProgress(prev => ({
        ...prev,
        [data.syncType]: data
      }));
      setLastUpdate(new Date());
    };

    const handleComplete = (data) => {
      console.log('✅ Sync complete:', data);
      setCompletedSyncs(prev => [...prev.slice(-9), data]); // Keep last 10
      setProgress(prev => {
        const next = { ...prev };
        delete next[data.syncType];
        return next;
      });
      setLastUpdate(new Date());
    };

    const handleError = (data) => {
      console.error('❌ Sync error:', data);
      setErrors(prev => [...prev.slice(-9), data]); // Keep last 10
      setLastUpdate(new Date());
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('sync:progress', handleProgress);
    socket.on('sync:complete', handleComplete);
    socket.on('sync:error', handleError);

    // Check if already connected
    if (socket.connected) {
      handleConnect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('sync:progress', handleProgress);
      socket.off('sync:complete', handleComplete);
      socket.off('sync:error', handleError);
      
      connectionCount--;
      // Only disconnect if no more subscribers
      if (connectionCount === 0 && socket) {
        socket.disconnect();
        socket = null;
      }
    };
  }, [syncTypes.join(',')]);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const clearCompleted = useCallback(() => {
    setCompletedSyncs([]);
  }, []);

  return {
    connected,
    lastUpdate,
    progress,
    completedSyncs,
    errors,
    clearErrors,
    clearCompleted,
    activeSyncs: Object.keys(progress),
  };
}

/**
 * Simple hook to check WebSocket connection status
 */
export function useSocketStatus() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  return connected;
}

export default useSyncSocket;
