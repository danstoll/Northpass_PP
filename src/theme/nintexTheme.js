/**
 * Nintex MUI Theme
 * Custom Material-UI theme with Nintex brand colors
 * Light theme - matches DataSync styling
 */
import { createTheme } from '@mui/material/styles';

// Nintex brand colors
const nintexColors = {
  orange: {
    main: '#FF6B35',
    light: '#FF8F66',
    dark: '#E55A2B',
    contrastText: '#FFFFFF',
  },
  purple: {
    main: '#6B4C9A',
    light: '#8B6CB8',
    dark: '#4A3570',
    contrastText: '#FFFFFF',
  },
  success: {
    main: '#28a745',
    light: '#48c765',
    dark: '#1e7e34',
  },
  warning: {
    main: '#FFA726',
    light: '#FFB851',
    dark: '#F57C00',
  },
  error: {
    main: '#dc3545',
    light: '#e4606d',
    dark: '#c82333',
  },
};

// Create the theme - LIGHT MODE (matches DataSync)
const nintexTheme = createTheme({
  palette: {
    mode: 'light',
    primary: nintexColors.orange,
    secondary: nintexColors.purple,
    success: nintexColors.success,
    warning: nintexColors.warning,
    error: nintexColors.error,
    background: {
      default: '#f5f5f5',  // Light gray background
      paper: '#ffffff',    // White cards/paper
    },
    text: {
      primary: '#333333',
      secondary: '#666666',
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '1.5rem',
      fontWeight: 600,
      color: '#333333',
    },
    h2: {
      fontSize: '1.25rem',
      fontWeight: 600,
      color: '#333333',
    },
    h3: {
      fontSize: '1.1rem',
      fontWeight: 600,
      color: '#333333',
    },
    h4: {
      fontSize: '1rem',
      fontWeight: 600,
      color: '#333333',
    },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          padding: '10px 20px',
          fontWeight: 500,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(255, 107, 53, 0.3)',
          },
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #6B4C9A 0%, #FF6B35 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #5a3d8a 0%, #e55a2b 100%)',
          },
        },
        outlined: {
          borderWidth: 1,
          '&:hover': {
            borderWidth: 1,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          background: '#ffffff',
          border: '1px solid #ddd',
          borderRadius: 8,
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#ffffff',
            '& fieldset': {
              borderColor: '#ddd',
            },
            '&:hover fieldset': {
              borderColor: '#FF6B35',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#FF6B35',
            },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
        colorSuccess: {
          backgroundColor: '#d4edda',
          color: '#155724',
        },
        colorWarning: {
          backgroundColor: '#fff3cd',
          color: '#856404',
        },
        colorError: {
          backgroundColor: '#f8d7da',
          color: '#721c24',
        },
        colorInfo: {
          backgroundColor: '#cce5ff',
          color: '#004085',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderColor: '#ddd',
          color: '#333',
        },
        head: {
          fontWeight: 600,
          backgroundColor: '#f5f5f5',
          color: '#333',
          fontSize: '0.85rem',
          textTransform: 'uppercase',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: '#f9f9f9',
          },
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
        standardSuccess: {
          backgroundColor: '#d4edda',
          color: '#155724',
        },
        standardError: {
          backgroundColor: '#f8d7da',
          color: '#721c24',
        },
        standardWarning: {
          backgroundColor: '#fff3cd',
          color: '#856404',
        },
        standardInfo: {
          backgroundColor: '#cce5ff',
          color: '#004085',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          backgroundColor: '#e0e0e0',
        },
        bar: {
          borderRadius: 4,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          background: '#ffffff',
          border: '1px solid #ddd',
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          borderBottom: '2px solid #eee',
        },
        indicator: {
          backgroundColor: '#FF6B35',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          color: '#666',
          '&.Mui-selected': {
            color: '#FF6B35',
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(255, 107, 53, 0.1)',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          background: 'linear-gradient(135deg, #6B4C9A 0%, #4A3570 100%)',
          color: '#ffffff',
        },
      },
    },
  },
});

export default nintexTheme;
export { nintexColors };
