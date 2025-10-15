import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import installExtensionImportGuard from './utils/extensionImportGuard';

// Install helpful guard early to prevent noisy unhandledrejection logs from browser extensions
installExtensionImportGuard();

createRoot(document.getElementById('root')).render(
  <App />
)
