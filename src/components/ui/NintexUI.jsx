/**
 * Nintex UI Components
 * Reusable MUI-based components with Nintex styling
 */
import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Alert,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  IconButton,
  Tooltip,
  Tab,
  Tabs,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  CheckCircle,
  Warning,
  Error as ErrorIcon,
  Info,
  Search,
  Refresh,
  Close,
  ArrowBack,
} from '@mui/icons-material';

// ============ PAGE LAYOUT COMPONENTS ============

// Page Header - consistent header for all admin pages
export const PageHeader = ({ 
  icon, 
  title, 
  subtitle,
  onBack,
  actions,
}) => {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        {onBack && (
          <IconButton onClick={onBack} sx={{ color: 'var(--admin-text-secondary)' }}>
            <ArrowBack />
          </IconButton>
        )}
        <Box sx={{ flex: 1 }}>
          <Typography 
            variant="h1" 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 1.5,
              fontSize: '1.75rem',
              fontWeight: 600,
              color: 'var(--admin-text-primary)',
            }}
          >
            {icon && <span style={{ fontSize: '1.5rem' }}>{icon}</span>}
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ color: 'var(--admin-text-secondary)', mt: 0.5 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
      </Box>
    </Box>
  );
};

// Page Content wrapper - consistent padding and width
export const PageContent = ({ children, maxWidth }) => {
  return (
    <Box sx={{ 
      p: 3, 
      width: '100%',
      maxWidth: maxWidth || '100%',
    }}>
      {children}
    </Box>
  );
};

// Stats Row - horizontal row of stat cards
export const StatsRow = ({ children, columns = 4 }) => {
  return (
    <Box sx={{ 
      display: 'grid',
      gridTemplateColumns: `repeat(${columns}, 1fr)`,
      gap: 2,
      mb: 3,
      '@media (max-width: 1200px)': {
        gridTemplateColumns: 'repeat(2, 1fr)',
      },
      '@media (max-width: 600px)': {
        gridTemplateColumns: '1fr',
      },
    }}>
      {children}
    </Box>
  );
};

// Tab Panel wrapper
export const TabPanel = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

// Section Card - consistent card wrapper for content sections
export const SectionCard = ({ 
  title, 
  subtitle,
  icon,
  action,
  children, 
  noPadding,
  collapsible,
  defaultExpanded = true,
}) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  
  return (
    <Card sx={{ mb: 3 }}>
      {(title || action) && (
        <Box sx={{ 
          p: 2, 
          pb: noPadding && expanded ? 0 : 2,
          borderBottom: expanded ? '1px solid var(--admin-border-light)' : 'none',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: collapsible ? 'pointer' : 'default',
        }}
        onClick={collapsible ? () => setExpanded(!expanded) : undefined}
        >
          <Box>
            <Typography variant="h3" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {icon && <span>{icon}</span>}
              {title}
              {collapsible && <span style={{ opacity: 0.5 }}>{expanded ? '▼' : '▶'}</span>}
            </Typography>
            {subtitle && (
              <Typography variant="body2" sx={{ opacity: 0.6, mt: 0.5 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {action && <Box onClick={e => e.stopPropagation()}>{action}</Box>}
        </Box>
      )}
      {expanded && (
        <CardContent sx={{ p: noPadding ? 0 : 2, '&:last-child': { pb: noPadding ? 0 : 2 } }}>
          {children}
        </CardContent>
      )}
    </Card>
  );
};

// ============ STAT DISPLAY COMPONENTS ============

// Stat Card - for displaying metrics
export const StatCard = ({ 
  icon, 
  value, 
  label, 
  variant = 'default', // 'default', 'success', 'warning', 'error', 'primary'
  size = 'medium', // 'small', 'medium', 'large'
  onClick,
  trend, // { value: number, label: string }
}) => {
  // Theme-aware backgrounds using CSS variables
  const variantBackgrounds = {
    default: 'var(--admin-bg-card)',
    success: 'var(--admin-success-bg)',
    warning: 'var(--admin-warning-bg)',
    error: 'var(--admin-error-bg)',
    primary: 'var(--admin-bg-card)',
  };

  // Theme-aware text colors using CSS variables
  const textColors = {
    default: 'var(--nintex-orange)',
    success: 'var(--admin-success-text)',
    warning: 'var(--admin-warning-text)',
    error: 'var(--admin-error-text)',
    primary: 'var(--nintex-orange)',
  };

  const sizes = {
    small: { padding: 2, valueSize: '1.5rem' },
    medium: { padding: 2.5, valueSize: '2rem' },
    large: { padding: 3, valueSize: '2.5rem' },
  };

  return (
    <Card 
      sx={{ 
        background: variantBackgrounds[variant],
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': onClick ? {
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        } : {
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        },
      }}
      onClick={onClick}
    >
      <CardContent sx={{ p: sizes[size].padding, textAlign: 'center' }}>
        {icon && (
          <Box sx={{ fontSize: '1.75rem', mb: 1 }}>
            {icon}
          </Box>
        )}
        <Typography 
          variant="h2" 
          sx={{ 
            fontSize: sizes[size].valueSize, 
            fontWeight: 700,
            color: textColors[variant],
            lineHeight: 1.2,
          }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5, fontSize: '0.85rem' }}>
          {label}
        </Typography>
        {trend && (
          <Typography 
            variant="caption" 
            sx={{ 
              color: trend.value >= 0 ? 'var(--admin-success)' : 'var(--admin-error)',
              display: 'block',
              mt: 0.5,
            }}
          >
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

// Status Chip - for showing status indicators
export const StatusChip = ({ status, label, size = 'small' }) => {
  const statusConfig = {
    success: { color: 'success', icon: <CheckCircle fontSize="small" /> },
    completed: { color: 'success', icon: <CheckCircle fontSize="small" /> },
    active: { color: 'success', icon: <CheckCircle fontSize="small" /> },
    linked: { color: 'success', icon: <CheckCircle fontSize="small" /> },
    warning: { color: 'warning', icon: <Warning fontSize="small" /> },
    pending: { color: 'warning', icon: <Warning fontSize="small" /> },
    partial: { color: 'warning', icon: <Warning fontSize="small" /> },
    error: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
    failed: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
    expired: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
    info: { color: 'info', icon: <Info fontSize="small" /> },
    running: { color: 'info', icon: <CircularProgress size={14} /> },
    syncing: { color: 'info', icon: <CircularProgress size={14} /> },
  };

  const config = statusConfig[status?.toLowerCase()] || statusConfig.info;

  return (
    <Chip
      icon={config.icon}
      label={label || status}
      color={config.color}
      size={size}
      variant="outlined"
    />
  );
};

// Tier Badge - for partner tiers
export const TierBadge = ({ tier, size = 'small' }) => {
  const tierConfig = {
    premier: { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000' },
    select: { bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', color: '#000' },
    registered: { bg: 'linear-gradient(135deg, #CD7F32, #8B4513)', color: '#FFF' },
    certified: { bg: 'var(--nintex-gradient-purple)', color: '#FFF' },
  };

  const config = tierConfig[tier?.toLowerCase()] || tierConfig.certified;

  return (
    <Chip
      label={tier || 'Unknown'}
      size={size}
      sx={{
        background: config.bg,
        color: config.color,
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    />
  );
};

// Progress Bar with label
export const LabeledProgress = ({ 
  value, 
  label, 
  showPercentage = true,
  color = 'primary',
  height = 8,
}) => {
  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" sx={{ opacity: 0.8 }}>
          {label}
        </Typography>
        {showPercentage && (
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {Math.round(value)}%
          </Typography>
        )}
      </Box>
      <LinearProgress 
        variant="determinate" 
        value={Math.min(100, Math.max(0, value))} 
        color={color}
        sx={{ height, borderRadius: height / 2 }}
      />
    </Box>
  );
};

// ============ INPUT COMPONENTS ============

// Search Input
export const SearchInput = ({ 
  value, 
  onChange, 
  placeholder = 'Search...', 
  onClear,
  fullWidth = true,
  size = 'small',
}) => {
  return (
    <TextField
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      size={size}
      fullWidth={fullWidth}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <Search sx={{ opacity: 0.5 }} />
          </InputAdornment>
        ),
        endAdornment: value && onClear && (
          <InputAdornment position="end">
            <IconButton size="small" onClick={onClear}>
              <Close fontSize="small" />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
};

// Filter Select
export const FilterSelect = ({
  label,
  value,
  onChange,
  options, // [{ value, label }]
  fullWidth = false,
  size = 'small',
  minWidth = 150,
}) => {
  return (
    <FormControl size={size} sx={{ minWidth }} fullWidth={fullWidth}>
      <InputLabel>{label}</InputLabel>
      <Select
        value={value}
        label={label}
        onChange={(e) => onChange(e.target.value)}
      >
        <MenuItem value="">All</MenuItem>
        {options.map((opt) => (
          <MenuItem key={opt.value} value={opt.value}>
            {opt.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};

// ============ BUTTON COMPONENTS ============

// Action Button with loading state
export const ActionButton = ({ 
  children, 
  loading, 
  icon,
  variant = 'contained',
  color = 'primary',
  size = 'medium',
  ...props 
}) => {
  return (
    <Button
      variant={variant}
      color={color}
      size={size}
      disabled={loading || props.disabled}
      startIcon={loading ? <CircularProgress size={18} color="inherit" /> : icon}
      {...props}
    >
      {children}
    </Button>
  );
};

// Refresh Button
export const RefreshButton = ({ onClick, loading, tooltip = 'Refresh', size = 'medium' }) => {
  return (
    <Tooltip title={tooltip}>
      <span>
        <IconButton onClick={onClick} disabled={loading} size={size}>
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <Refresh />
          )}
        </IconButton>
      </span>
    </Tooltip>
  );
};

// ============ FEEDBACK COMPONENTS ============

// Result Alert - for showing operation results
export const ResultAlert = ({ 
  type = 'success', 
  title, 
  message, 
  onClose,
  action,
  sx,
}) => {
  return (
    <Alert 
      severity={type}
      onClose={onClose}
      action={action}
      sx={{ mb: 2, ...sx }}
    >
      {title && <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{title}</Typography>}
      {message && <Typography variant="body2">{message}</Typography>}
    </Alert>
  );
};

// Section Header
export const SectionHeader = ({ 
  icon, 
  title, 
  subtitle,
  action,
}) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'flex-start',
      mb: 3,
    }}>
      <Box>
        <Typography variant="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {icon && <span>{icon}</span>}
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box>{action}</Box>}
    </Box>
  );
};

// Empty State
export const EmptyState = ({ 
  icon = '📭', 
  title = 'No data', 
  message,
  action,
}) => {
  return (
    <Box sx={{ 
      textAlign: 'center', 
      py: 8,
      opacity: 0.7,
    }}>
      <Typography sx={{ fontSize: '3rem', mb: 2 }}>{icon}</Typography>
      <Typography variant="h3" sx={{ mb: 1 }}>{title}</Typography>
      {message && (
        <Typography variant="body2" sx={{ opacity: 0.7, mb: 3 }}>
          {message}
        </Typography>
      )}
      {action}
    </Box>
  );
};

// Loading Spinner with message
export const LoadingState = ({ message = 'Loading...' }) => {
  return (
    <Box sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center',
      py: 8,
      gap: 2,
    }}>
      <CircularProgress color="primary" />
      <Typography variant="body2" sx={{ opacity: 0.7 }}>
        {message}
      </Typography>
    </Box>
  );
};

// ============ TABLE COMPONENTS ============

// Data Table wrapper
export const DataTable = ({ 
  columns, // [{ id, label, align, width, render }]
  data,
  onRowClick,
  emptyMessage = 'No data found',
  stickyHeader = true,
  maxHeight,
}) => {
  if (!data || data.length === 0) {
    return <EmptyState icon="📋" title={emptyMessage} />;
  }

  return (
    <TableContainer 
      component={Paper} 
      sx={{ 
        maxHeight: maxHeight,
        background: 'transparent',
      }}
    >
      <Table stickyHeader={stickyHeader} size="small">
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <TableCell 
                key={col.id} 
                align={col.align || 'left'}
                sx={{ 
                  fontWeight: 600,
                  width: col.width,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, idx) => (
            <TableRow 
              key={row.id || idx}
              onClick={() => onRowClick?.(row)}
              sx={{ 
                cursor: onRowClick ? 'pointer' : 'default',
                '&:hover': onRowClick ? { bgcolor: 'var(--admin-bg-hover)' } : {},
              }}
            >
              {columns.map((col) => (
                <TableCell key={col.id} align={col.align || 'left'}>
                  {col.render ? col.render(row[col.id], row) : row[col.id]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// ============ EXPORTS ============

export default {
  // Layout
  PageHeader,
  PageContent,
  StatsRow,
  TabPanel,
  SectionCard,
  // Stats
  StatCard,
  StatusChip,
  TierBadge,
  LabeledProgress,
  // Inputs
  SearchInput,
  FilterSelect,
  // Buttons
  ActionButton,
  RefreshButton,
  // Feedback
  ResultAlert,
  SectionHeader,
  EmptyState,
  LoadingState,
  // Tables
  DataTable,
};
