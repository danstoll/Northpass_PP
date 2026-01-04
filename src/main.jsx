import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import nintexTheme from './theme/nintexTheme'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import installExtensionImportGuard from './utils/extensionImportGuard';

// Install helpful guard early to prevent noisy unhandledrejection logs from browser extensions
installExtensionImportGuard();

createRoot(document.getElementById('root')).render(
  <ThemeProvider theme={nintexTheme}>
    <CssBaseline />
    <AuthProvider>
      <App />
    </AuthProvider>
  </ThemeProvider>
)
