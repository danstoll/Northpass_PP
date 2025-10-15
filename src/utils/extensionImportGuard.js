// Lightweight runtime guard to silence noisy dynamic import errors caused by browser extensions
// Some Chrome extensions inject script tags or try to load helper assets via chrome-extension:// URLs.
// Those dynamic imports can surface as unhandled promise rejections in the app. We don't control
// the extension, so ignore only the well-known pattern to avoid masking real errors.

export function installExtensionImportGuard() {
  if (typeof window === 'undefined' || !window.addEventListener) return;

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason = event.reason;
      const message = reason && (reason.message || (typeof reason === 'string' ? reason : ''));

      // If it's a dynamic import failure pointing to a chrome-extension URL, ignore it
      if (message && message.includes('chrome-extension://') && message.includes('Failed to fetch dynamically imported module')) {
        console.debug('[extensionImportGuard] Ignoring extension dynamic import failure:', message);
        // Prevent default handling so it's not logged as an uncaught error
        event.preventDefault();
        return;
      }
    } catch (err) {
      // Don't let the guard throw
      console.error('[extensionImportGuard] Error while handling unhandledrejection:', err);
    }
    // Otherwise, let the event bubble (no change)
  });
}

export default installExtensionImportGuard;
