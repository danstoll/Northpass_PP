import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
} from '@mui/material';
import {
  ArrowBack,
  Search,
  Assessment,
  EmojiEvents,
  Warning,
  Business,
  School,
  PersonOff,
  Hotel,
  MenuBook,
  Schedule,
  AccessTime,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  DonutLarge,
} from '@mui/icons-material';
import { 
  PageHeader, 
  PageContent, 
  StatsRow, 
  StatCard, 
  SectionCard,
  ActionButton,
  LoadingState,
  EmptyState,
  TierBadge,
  StatusChip,
} from './ui/NintexUI';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import './DatabaseReports.css';

// ===========================================
// CHART COMPONENTS - Using Recharts Library
// ===========================================

// Tier colors mapping
const TIER_COLORS = {
  'Premier Plus': '#FFA500',
  'Premier': '#FFD700',
  'Aggregator': '#9C27B0',
  'Select': '#FF6B35',
  'Certified': '#1565C0',
  'Registered': '#42A5F5',
  'Unknown': '#9e9e9e'
};

// Donut Chart Component using Recharts
const DonutChart = ({ data, title, centerText, centerValue }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;

  // Map data to include colors
  const chartData = data.map(item => ({
    ...item,
    name: item.label,
    fill: TIER_COLORS[item.label] || item.color || '#6B4C9A'
  }));

  return (
    <Box className="chart-card donut-chart-card">
      <Typography variant="h6" className="chart-title">
        <PieChartIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#FF6B35' }} />
        {title}
      </Typography>
      <Box className="donut-container-recharts">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value, name) => [value.toLocaleString(), name]}
              contentStyle={{ 
                background: 'var(--admin-bg-card)', 
                border: '1px solid var(--admin-border-default)',
                borderRadius: '8px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <Box className="donut-center-overlay">
          <span className="center-value-large">{centerValue.toLocaleString()}</span>
          <span className="center-label-large">{centerText}</span>
        </Box>
      </Box>
      <Box className="chart-legend-horizontal">
        {chartData.map((item, idx) => (
          <Box key={idx} className="legend-item-badge" style={{ borderColor: item.fill }}>
            <span className="legend-dot" style={{ background: item.fill }} />
            <span className="legend-tier">{item.name}</span>
            <span className="legend-count">{item.value}</span>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Horizontal Bar Chart Component - Animated gradient bars
const HorizontalBarChart = ({ data, title, maxValue, valueLabel = '', icon }) => {
  const max = maxValue || Math.max(...data.map(d => d.value), 1);
  if (!data || data.length === 0) return null;
  
  // Color palette for bars
  const barColors = [
    ['#FF6B35', '#FF8F65'],
    ['#6B4C9A', '#9575CD'],
    ['#28a745', '#5cb85c'],
    ['#17a2b8', '#5dade2'],
    ['#ffc107', '#ffdb4d'],
    ['#e91e63', '#f06292'],
    ['#00bcd4', '#4dd0e1'],
    ['#9c27b0', '#ba68c8']
  ];
  
  return (
    <Box className="chart-card bar-chart-card-visual">
      <Typography variant="h6" className="chart-title">
        {icon || <BarChartIcon sx={{ mr: 1, verticalAlign: 'middle', color: '#6B4C9A' }} />}
        {title}
      </Typography>
      <Box className="bar-chart-visual-container">
        {data.slice(0, 6).map((item, idx) => {
          const pct = (item.value / max) * 100;
          const [colorStart, colorEnd] = barColors[idx % barColors.length];
          return (
            <Box key={idx} className="bar-row-visual">
              <Box className="bar-rank">{idx + 1}</Box>
              <Box className="bar-info">
                <Box className="bar-label-visual" title={item.label}>
                  {item.label.length > 25 ? item.label.substring(0, 23) + '...' : item.label}
                </Box>
                <Box className="bar-track-visual">
                  <Box 
                    className="bar-fill-animated"
                    style={{ 
                      '--bar-width': `${pct}%`,
                      '--bar-color-start': colorStart,
                      '--bar-color-end': colorEnd,
                      animationDelay: `${idx * 0.1}s`
                    }}
                  >
                    <span className="bar-value-inside">{item.value}{valueLabel}</span>
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

// Progress Ring Component - Large animated gauges with gradients
const ProgressRing = ({ value, max, label, color = '#FF6B35', gradientId, size = 120 }) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  const gradients = {
    green: ['#28a745', '#20c997'],
    orange: ['#FF6B35', '#ffc107'],
    purple: ['#6B4C9A', '#9c27b0'],
    blue: ['#17a2b8', '#42A5F5']
  };
  
  const [startColor, endColor] = gradients[gradientId] || [color, color];
  const uniqueId = `ring-${gradientId || 'default'}-${label.replace(/\s+/g, '')}`;
  
  return (
    <Box className="progress-ring-visual">
      <svg width={size} height={size} viewBox="0 0 120 120">
        <defs>
          <linearGradient id={uniqueId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={startColor} />
            <stop offset="100%" stopColor={endColor} />
          </linearGradient>
          <filter id={`glow-${uniqueId}`}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Background track */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#e8e8e8"
          strokeWidth="12"
        />
        
        {/* Progress arc with gradient */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={`url(#${uniqueId})`}
          strokeWidth="12"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          className="progress-ring-animated"
          filter={`url(#glow-${uniqueId})`}
        />
        
        {/* Center content */}
        <text x="60" y="55" textAnchor="middle" className="ring-percentage" fill="var(--admin-text-primary)">
          {percentage.toFixed(0)}%
        </text>
        <text x="60" y="72" textAnchor="middle" className="ring-count" fill="var(--admin-text-secondary)">
          {value.toLocaleString()}/{max.toLocaleString()}
        </text>
      </svg>
      <Typography className="ring-label-visual">{label}</Typography>
    </Box>
  );
};

// Metric Trend Card
const MetricCard = ({ icon, value, label, trend, trendLabel, color = 'primary' }) => {
  const colorMap = {
    primary: '#FF6B35',
    success: '#28a745', 
    warning: '#ffc107',
    error: '#dc3545',
    purple: '#6B4C9A'
  };
  
  return (
    <Box className="metric-card" style={{ borderLeftColor: colorMap[color] }}>
      <Box className="metric-icon">{icon}</Box>
      <Box className="metric-content">
        <span className="metric-value">{typeof value === 'number' ? value.toLocaleString() : value}</span>
        <span className="metric-label">{label}</span>
        {trend !== undefined && (
          <span className={`metric-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% {trendLabel}
          </span>
        )}
      </Box>
    </Box>
  );
};

/**
 * DatabaseReports Component
 * Generate reports from the local MariaDB database
 * Now with a dashboard landing page - reports only run on demand
 */
function DatabaseReports() {
  const [activeReport, setActiveReport] = useState(null); // null = landing page
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [filters, setFilters] = useState({ tiers: [], regions: [], owners: [] });
  const [selectedTier, setSelectedTier] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [daysFilter, setDaysFilter] = useState(30);
  
  // Sorting state
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  
  // Report data
  const [overview, setOverview] = useState(null);
  const [userCerts, setUserCerts] = useState([]);
  const [notInLms, setNotInLms] = useState([]);
  const [lmsNotInCrm, setLmsNotInCrm] = useState({ users: [], stats: {} });
  const [partnersWithoutGroups, setPartnersWithoutGroups] = useState([]);
  const [certGaps, setCertGaps] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [coursePopularity, setCoursePopularity] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [expiringCerts, setExpiringCerts] = useState([]);
  const [inactiveUsers, setInactiveUsers] = useState([]);
  
  // Quick stats for landing page (lightweight)
  const [quickStats, setQuickStats] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [loadingStats, setLoadingStats] = useState(true);

  // Sorting helper
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  };

  const sortData = useCallback((data) => {
    if (!sortConfig.key || !data) return data;
    
    return [...data].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      // Handle null/undefined
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      
      // Numeric comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      
      // String comparison (case insensitive)
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      
      if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortConfig]);

  // Load filter options
  const loadFilters = useCallback(async () => {
    try {
      const response = await fetch('/api/db/reports/filters');
      if (response.ok) {
        const data = await response.json();
        setFilters(data);
      }
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  }, []);

  // Load quick stats for landing page (lightweight query)
  const loadQuickStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const response = await fetch('/api/db/stats');
      if (response.ok) {
        const data = await response.json();
        setQuickStats(data);
      }
    } catch (err) {
      console.error('Quick stats error:', err);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  // Load overview report
  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/reports/overview');
      if (response.ok) {
        const data = await response.json();
        setOverview(data);
        setError(null);
      }
    } catch (err) {
      console.error('Overview error:', err);
      setError('Failed to load overview');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load user certifications report
  const loadUserCerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTier) params.append('tier', selectedTier);
      if (selectedRegion) params.append('region', selectedRegion);
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await fetch(`/api/db/reports/user-certifications?${params}`);
      if (response.ok) {
        const data = await response.json();
        setUserCerts(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('User certs error:', err);
      setError('Failed to load user certifications');
    } finally {
      setLoading(false);
    }
  }, [selectedTier, selectedRegion, searchTerm]);

  // Load contacts not in LMS
  const loadNotInLms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTier) params.append('tier', selectedTier);
      if (selectedRegion) params.append('region', selectedRegion);
      if (selectedOwner) params.append('owner', selectedOwner);
      params.append('excludePersonal', 'true');
      
      const response = await fetch(`/api/db/reports/contacts-not-in-lms?${params}`);
      if (response.ok) {
        const data = await response.json();
        setNotInLms(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Not in LMS error:', err);
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [selectedTier, selectedRegion, selectedOwner]);

  // Load LMS users not in CRM (in groups but not in Salesforce)
  const loadLmsNotInCrm = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      
      const response = await fetch(`/api/db/reports/lms-users-not-in-crm?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLmsNotInCrm({
          users: Array.isArray(data?.users) ? data.users : [],
          stats: data?.stats || {}
        });
        setError(null);
      }
    } catch (err) {
      console.error('LMS users not in CRM error:', err);
      setError('Failed to load LMS users');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  // Load partners without groups
  const loadPartnersWithoutGroups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/reports/partners-without-groups');
      if (response.ok) {
        const data = await response.json();
        setPartnersWithoutGroups(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Partners without groups error:', err);
      setError('Failed to load partners');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load certification gaps
  const loadCertGaps = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTier) params.append('tier', selectedTier);
      
      const response = await fetch(`/api/db/reports/certification-gaps?${params}`);
      if (response.ok) {
        const data = await response.json();
        setCertGaps(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Cert gaps error:', err);
      setError('Failed to load certification gaps');
    } finally {
      setLoading(false);
    }
  }, [selectedTier]);

  // Load partner leaderboard
  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedTier) params.append('tier', selectedTier);
      if (selectedRegion) params.append('region', selectedRegion);
      
      const response = await fetch(`/api/db/reports/partner-leaderboard?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLeaderboard(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Leaderboard error:', err);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, [selectedTier, selectedRegion]);

  // Load course popularity
  const loadCoursePopularity = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/reports/course-popularity');
      if (response.ok) {
        const data = await response.json();
        setCoursePopularity(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Course popularity error:', err);
      setError('Failed to load course popularity');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load recent activity
  const loadRecentActivity = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('days', daysFilter.toString());
      
      const response = await fetch(`/api/db/reports/recent-activity?${params}`);
      if (response.ok) {
        const data = await response.json();
        setRecentActivity(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Recent activity error:', err);
      setError('Failed to load recent activity');
    } finally {
      setLoading(false);
    }
  }, [daysFilter]);

  // Load expiring certifications
  const loadExpiringCerts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/reports/expiring-certifications?days=90');
      if (response.ok) {
        const data = await response.json();
        setExpiringCerts(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Expiring certs error:', err);
      setError('Failed to load expiring certifications');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load inactive users
  const loadInactiveUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/reports/inactive-users?days=180');
      if (response.ok) {
        const data = await response.json();
        setInactiveUsers(Array.isArray(data) ? data : []);
        setError(null);
      }
    } catch (err) {
      console.error('Inactive users error:', err);
      setError('Failed to load inactive users');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load - only quick stats and filters
  useEffect(() => {
    loadFilters();
    loadQuickStats();
  }, [loadFilters, loadQuickStats]);

  // Run report when user explicitly selects one
  const runReport = (reportType) => {
    setActiveReport(reportType);
    // Clear previous data
    setError(null);
    
    switch (reportType) {
      case 'overview':
        if (!overview) loadOverview();
        break;
      case 'certifications':
        loadUserCerts();
        break;
      case 'not-in-lms':
        loadNotInLms();
        break;
      case 'no-groups':
        if (partnersWithoutGroups.length === 0) loadPartnersWithoutGroups();
        break;
      case 'gaps':
        loadCertGaps();
        break;
      case 'leaderboard':
        loadLeaderboard();
        break;
      case 'courses':
        loadCoursePopularity();
        break;
      case 'activity':
        loadRecentActivity();
        break;
      case 'expiring':
        loadExpiringCerts();
        break;
      case 'inactive':
        loadInactiveUsers();
        break;
      case 'lms-not-in-crm':
        loadLmsNotInCrm();
        break;
    }
  };

  // Export to CSV
  const exportToCsv = (data, filename) => {
    if (!data || data.length === 0) return;
    
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = String(val);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  // Back to landing page
  const backToLanding = () => {
    setActiveReport(null);
    setError(null);
  };

  // Report card config
  const reportCards = [
    { id: 'overview', icon: <TrendingUp />, title: 'Overview Dashboard', desc: 'Summary statistics by tier, region, and owner.', category: 'partners' },
    { id: 'leaderboard', icon: <EmojiEvents />, title: 'Partner Leaderboard', desc: 'Top partners ranked by NPCU points.', category: 'partners' },
    { id: 'gaps', icon: <Warning />, title: 'Certification Gaps', desc: 'Partners not meeting tier requirements.', category: 'partners' },
    { id: 'no-groups', icon: <Business />, title: 'Partners Without Groups', desc: 'Partners without LMS groups.', category: 'partners' },
    { id: 'certifications', icon: <School />, title: 'User Certifications', desc: 'All contacts with certification data.', category: 'users' },
    { id: 'not-in-lms', icon: <PersonOff />, title: 'Contacts Not in LMS', desc: 'CRM contacts not in learning system.', category: 'users' },
    { id: 'lms-not-in-crm', icon: <PersonOff />, title: 'LMS Users Not in CRM', desc: 'LMS users in groups but missing from Salesforce.', category: 'users' },
    { id: 'inactive', icon: <Hotel />, title: 'Inactive Users', desc: 'Users with no recent activity.', category: 'users' },
    { id: 'courses', icon: <MenuBook />, title: 'Popular Courses', desc: 'Most completed courses.', category: 'courses' },
    { id: 'activity', icon: <Schedule />, title: 'Recent Activity', desc: 'Latest course completions.', category: 'courses' },
    { id: 'expiring', icon: <AccessTime />, title: 'Expiring Certifications', desc: 'Certifications expiring soon.', category: 'courses' },
  ];

  return (
    <PageContent>
      <PageHeader
        icon={<Assessment />}
        title="Reports"
        subtitle={activeReport ? 'Report Results' : 'Dashboard & Reports'}
        onBack={activeReport ? backToLanding : undefined}
      />

      {/* Landing Page - Report Selection */}
      {!activeReport && (
        <Box>
          {/* Quick Stats Summary */}
          <StatsRow columns={4}>
            <StatCard
              icon="🏢"
              value={quickStats?.partners || 0}
              label="Partners"
              variant="primary"
              size="small"
            />
            <StatCard
              icon="👤"
              value={quickStats?.contacts || 0}
              label="Contacts"
              variant="default"
              size="small"
            />
            <StatCard
              icon="🎓"
              value={quickStats?.lmsUsers || 0}
              label="LMS Users"
              variant="default"
              size="small"
            />
            <StatCard
              icon="🔗"
              value={quickStats?.linkedContacts || 0}
              label="Linked"
              variant="success"
              size="small"
            />
          </StatsRow>

          {/* ============================================ */}
          {/* VISUAL CHARTS SECTION - Eye-catching Reports */}
          {/* ============================================ */}
          <SectionCard title="Quick Insights" icon="📈" defaultOpen={true}>
            {/* Load Button - shown when no data */}
            {!overview && (
              <Box className="charts-load-prompt">
                <Box className="charts-preview">
                  <PieChartIcon sx={{ fontSize: 48, color: '#FF6B35', opacity: 0.6 }} />
                  <BarChartIcon sx={{ fontSize: 48, color: '#6B4C9A', opacity: 0.6 }} />
                  <DonutLarge sx={{ fontSize: 48, color: '#28a745', opacity: 0.6 }} />
                </Box>
                <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>
                  Visual Analytics Dashboard
                </Typography>
                <Typography variant="body2" sx={{ mb: 3, opacity: 0.7, maxWidth: 400 }}>
                  Load interactive charts showing partner distribution, LMS coverage, regional breakdown, and top account owners.
                </Typography>
                <ActionButton
                  onClick={() => loadOverview()}
                  loading={loading}
                  variant="contained"
                  sx={{ 
                    px: 4, 
                    py: 1.5,
                    background: 'linear-gradient(135deg, #FF6B35 0%, #6B4C9A 100%)',
                    fontSize: '1rem',
                    '&:hover': {
                      background: 'linear-gradient(135deg, #E55A2B 0%, #5a3d87 100%)',
                    }
                  }}
                >
                  📊 Load Visual Charts
                </ActionButton>
              </Box>
            )}
            
            {/* Charts Grid - shown when data loaded */}
            {overview && (
              <Box className="charts-visual-grid">
                {/* Row 1: Donut Chart + Coverage Rings */}
                <Box className="charts-row-main">
                  {/* Partner Tier Distribution - Large Donut Chart */}
                  {overview?.byTier && overview.byTier.length > 0 && (
                    <DonutChart
                      title="Partners by Tier"
                      data={overview.byTier.map((t, i) => ({
                        label: t.tier || 'Unknown',
                        value: t.partner_count,
                        color: ['#FFD700', '#FF6B35', '#CD7F32', '#42A5F5', '#9C27B0'][i] || '#999'
                      }))}
                      centerValue={overview.totals?.total_partners || 0}
                      centerText="Partners"
                    />
                  )}

                  {/* LMS Coverage - Large Progress Rings */}
                  <Box className="chart-card coverage-rings-card">
                    <Typography variant="h6" className="chart-title">
                      <TrendingUp sx={{ mr: 1, verticalAlign: 'middle', color: '#28a745' }} />
                      LMS Coverage Metrics
                    </Typography>
                    <Box className="coverage-rings-row">
                      <ProgressRing
                        value={quickStats?.linkedContacts || 0}
                        max={quickStats?.contacts || 1}
                        label="Contacts in LMS"
                        gradientId="green"
                        size={130}
                      />
                      <ProgressRing
                        value={overview?.totals?.lms_linked_contacts || 0}
                        max={overview?.totals?.total_contacts || 1}
                        label="Partner Coverage"
                        gradientId="orange"
                        size={130}
                      />
                      <ProgressRing
                        value={overview?.byTier?.find(t => t.tier === 'Premier')?.lms_linked_count || 0}
                        max={overview?.byTier?.find(t => t.tier === 'Premier')?.contact_count || 1}
                        label="Premier Tier"
                        gradientId="purple"
                        size={130}
                      />
                    </Box>
                  </Box>
                </Box>

                {/* Row 2: Bar Charts */}
                <Box className="charts-row-bars">
                  {/* Regional Distribution */}
                  {overview?.byRegion && overview.byRegion.length > 0 && (
                    <HorizontalBarChart
                      title="Partners by Region"
                      icon={<Business sx={{ mr: 1, verticalAlign: 'middle', color: '#6B4C9A' }} />}
                      data={overview.byRegion.slice(0, 6).map((r) => ({
                        label: r.region || 'Unknown',
                        value: r.partner_count
                      }))}
                    />
                  )}

                  {/* Top Account Owners */}
                  {overview?.byOwner && overview.byOwner.length > 0 && (
                    <HorizontalBarChart
                      title="Top Account Owners"
                      icon={<EmojiEvents sx={{ mr: 1, verticalAlign: 'middle', color: '#ffc107' }} />}
                      data={overview.byOwner.slice(0, 6).map((o) => ({
                        label: o.owner || 'Unassigned',
                        value: o.partner_count
                      }))}
                    />
                  )}
                </Box>
              </Box>
            )}
          </SectionCard>

          {/* Report Cards - Partner Analytics */}
          <SectionCard title="Partner Analytics" icon="📊">
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 2,
            }}>
              {reportCards.filter(r => r.category === 'partners').map(report => (
                <Card 
                  key={report.id}
                  onClick={() => runReport(report.id)}
                  sx={{ 
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardContent>
                    <Box sx={{ color: 'primary.main', mb: 1 }}>{report.icon}</Box>
                    <Typography variant="h6" sx={{ mb: 0.5 }}>{report.title}</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>{report.desc}</Typography>
                    <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600 }}>
                      Generate Report →
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </SectionCard>

          {/* Report Cards - User Reports */}
          <SectionCard title="User Reports" icon="👥">
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 2,
            }}>
              {reportCards.filter(r => r.category === 'users').map(report => (
                <Card 
                  key={report.id}
                  onClick={() => runReport(report.id)}
                  sx={{ 
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardContent>
                    <Box sx={{ color: 'primary.main', mb: 1 }}>{report.icon}</Box>
                    <Typography variant="h6" sx={{ mb: 0.5 }}>{report.title}</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>{report.desc}</Typography>
                    <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600 }}>
                      Generate Report →
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </SectionCard>

          {/* Report Cards - Course & Activity */}
          <SectionCard title="Course & Activity" icon="📚">
            <Box sx={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: 2,
            }}>
              {reportCards.filter(r => r.category === 'courses').map(report => (
                <Card 
                  key={report.id}
                  onClick={() => runReport(report.id)}
                  sx={{ 
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      borderColor: 'primary.main',
                    },
                  }}
                >
                  <CardContent>
                    <Box sx={{ color: 'primary.main', mb: 1 }}>{report.icon}</Box>
                    <Typography variant="h6" sx={{ mb: 0.5 }}>{report.title}</Typography>
                    <Typography variant="body2" sx={{ opacity: 0.7, mb: 2 }}>{report.desc}</Typography>
                    <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 600 }}>
                      Generate Report →
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </SectionCard>
        </Box>
      )}

      {/* Active Report View */}
      {activeReport && (
        <>
          {/* Report Tabs for switching between loaded reports */}
          <nav className="report-tabs">
            <span className="tab-group">Partners:</span>
            <button 
              className={activeReport === 'overview' ? 'active' : ''} 
              onClick={() => runReport('overview')}
            >
              📈 Overview
            </button>
            <button 
              className={activeReport === 'leaderboard' ? 'active' : ''} 
              onClick={() => runReport('leaderboard')}
            >
              🏆 Leaderboard
            </button>
            <button 
              className={activeReport === 'gaps' ? 'active' : ''} 
              onClick={() => runReport('gaps')}
            >
              ⚠️ Gaps
            </button>
            <button 
              className={activeReport === 'no-groups' ? 'active' : ''} 
              onClick={() => runReport('no-groups')}
            >
              🏢 No Groups
            </button>
            <span className="tab-group">Users:</span>
            <button 
              className={activeReport === 'certifications' ? 'active' : ''} 
              onClick={() => runReport('certifications')}
            >
              🎓 Certs
            </button>
            <button 
              className={activeReport === 'not-in-lms' ? 'active' : ''} 
              onClick={() => runReport('not-in-lms')}
            >
              ❌ Not in LMS
            </button>
            <button 
              className={activeReport === 'inactive' ? 'active' : ''} 
              onClick={() => runReport('inactive')}
            >
              😴 Inactive
            </button>
            <span className="tab-group">Courses:</span>
            <button 
              className={activeReport === 'courses' ? 'active' : ''} 
              onClick={() => runReport('courses')}
            >
              📖 Popular
            </button>
            <button 
              className={activeReport === 'activity' ? 'active' : ''} 
              onClick={() => runReport('activity')}
            >
              🕐 Activity
            </button>
            <button 
              className={activeReport === 'expiring' ? 'active' : ''} 
              onClick={() => runReport('expiring')}
            >
              ⏰ Expiring
            </button>
          </nav>

          {/* Report Filters */}
          {!['overview', 'no-groups', 'courses', 'expiring', 'inactive'].includes(activeReport) && (
            <div className="report-filters d-flex align-center flex-wrap gap-3 mb-5">
              {['certifications', 'not-in-lms', 'gaps', 'leaderboard'].includes(activeReport) && (
                <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)}>
                  <option value="">All Tiers</option>
                  {filters.tiers.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
              
              {['certifications', 'not-in-lms', 'leaderboard'].includes(activeReport) && (
                <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)}>
                  <option value="">All Regions</option>
                  {filters.regions.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              
              {activeReport === 'not-in-lms' && (
                <select value={selectedOwner} onChange={(e) => setSelectedOwner(e.target.value)}>
                  <option value="">All Owners</option>
                  {filters.owners.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              
              {activeReport === 'certifications' && (
                <input 
                  type="search"
                  placeholder="Search name, email, company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoComplete="off"
                />
              )}
              
              {activeReport === 'activity' && (
                <select value={daysFilter} onChange={(e) => setDaysFilter(parseInt(e.target.value))}>
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={60}>Last 60 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              )}
              
              <button className="ntx-btn-primary" onClick={() => runReport(activeReport)}>
                🔄 Run Report
              </button>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="error-message d-flex justify-between align-center mb-5">
              <span>{error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="loading d-flex flex-column align-center gap-3 py-10">
              <div className="ntx-spinner"></div>
              <span className="opacity-70">Generating report...</span>
            </div>
          )}

          {/* Report Content */}
          {!loading && (
            <div className="report-content">
          {/* Overview Report */}
          {activeReport === 'overview' && overview && (
            <div className="overview-report">
              <div className="overview-totals">
                <div className="total-card">
                  <span className="value">{overview.totals?.total_partners || 0}</span>
                  <span className="label">Partners</span>
                </div>
                <div className="total-card">
                  <span className="value">{overview.totals?.total_contacts || 0}</span>
                  <span className="label">Contacts</span>
                </div>
                <div className="total-card highlight">
                  <span className="value">{overview.totals?.lms_linked_contacts || 0}</span>
                  <span className="label">In LMS</span>
                </div>
                <div className="total-card">
                  <span className="value">{overview.totals?.total_lms_users || 0}</span>
                  <span className="label">LMS Users</span>
                </div>
              </div>

              <div className="overview-sections">
                <div className="section">
                  <h3>By Partner Tier</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Tier</th>
                        <th>Partners</th>
                        <th>Contacts</th>
                        <th>In LMS</th>
                        <th>Coverage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.byTier?.map(row => (
                        <tr key={row.tier}>
                          <td><span className={`tier-badge ${row.tier?.toLowerCase()}`}>{row.tier}</span></td>
                          <td>{row.partner_count}</td>
                          <td>{row.contact_count}</td>
                          <td>{row.lms_linked_count}</td>
                          <td>
                            <span className={`coverage ${row.contact_count > 0 && (row.lms_linked_count / row.contact_count) > 0.5 ? 'good' : 'low'}`}>
                              {row.contact_count > 0 ? Math.round((row.lms_linked_count / row.contact_count) * 100) : 0}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="section">
                  <h3>By Region</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Region</th>
                        <th>Partners</th>
                        <th>Contacts</th>
                        <th>In LMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.byRegion?.map(row => (
                        <tr key={row.region}>
                          <td>{row.region}</td>
                          <td>{row.partner_count}</td>
                          <td>{row.contact_count}</td>
                          <td>{row.lms_linked_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="section">
                  <h3>Top Account Owners</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Owner</th>
                        <th>Partners</th>
                        <th>Contacts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.byOwner?.slice(0, 10).map(row => (
                        <tr key={row.owner}>
                          <td>{row.owner}</td>
                          <td>{row.partner_count}</td>
                          <td>{row.contact_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* User Certifications Report */}
          {activeReport === 'certifications' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{userCerts.length} contacts</span>
                <button onClick={() => exportToCsv(userCerts, 'user-certifications')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => requestSort('first_name')}>Name{getSortIndicator('first_name')}</th>
                    <th className="sortable" onClick={() => requestSort('email')}>Email{getSortIndicator('email')}</th>
                    <th className="sortable" onClick={() => requestSort('account_name')}>Company{getSortIndicator('account_name')}</th>
                    <th className="sortable" onClick={() => requestSort('partner_tier')}>Tier{getSortIndicator('partner_tier')}</th>
                    <th className="sortable" onClick={() => requestSort('completed_courses')}>Courses{getSortIndicator('completed_courses')}</th>
                    <th className="sortable" onClick={() => requestSort('certifications')}>Certs{getSortIndicator('certifications')}</th>
                    <th className="sortable" onClick={() => requestSort('total_npcu')}>NPCU{getSortIndicator('total_npcu')}</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(userCerts).map(row => (
                    <tr key={row.contact_id}>
                      <td>{row.first_name} {row.last_name}</td>
                      <td>{row.email}</td>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.completed_courses}</td>
                      <td>{row.certifications}</td>
                      <td className="npcu">{row.total_npcu}</td>
                      <td>
                        {row.lms_user_id ? (
                          <span className="status in-lms">✓ In LMS</span>
                        ) : (
                          <span className="status not-in-lms">Not in LMS</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Contacts Not in LMS Report */}
          {activeReport === 'not-in-lms' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{notInLms.length} contacts not in LMS</span>
                <button onClick={() => exportToCsv(notInLms, 'contacts-not-in-lms')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => requestSort('first_name')}>Name{getSortIndicator('first_name')}</th>
                    <th className="sortable" onClick={() => requestSort('email')}>Email{getSortIndicator('email')}</th>
                    <th className="sortable" onClick={() => requestSort('title')}>Title{getSortIndicator('title')}</th>
                    <th className="sortable" onClick={() => requestSort('account_name')}>Company{getSortIndicator('account_name')}</th>
                    <th className="sortable" onClick={() => requestSort('partner_tier')}>Tier{getSortIndicator('partner_tier')}</th>
                    <th className="sortable" onClick={() => requestSort('account_region')}>Region{getSortIndicator('account_region')}</th>
                    <th className="sortable" onClick={() => requestSort('account_owner')}>Owner{getSortIndicator('account_owner')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(notInLms).map(row => (
                    <tr key={row.id}>
                      <td>{row.first_name} {row.last_name}</td>
                      <td>{row.email}</td>
                      <td>{row.title || '-'}</td>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.account_region}</td>
                      <td>{row.account_owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* LMS Users Not in CRM Report */}
          {activeReport === 'lms-not-in-crm' && (
            <div className="table-report">
              <div className="report-stats">
                <StatsRow columns={4}>
                  <StatCard
                    icon="👤"
                    value={lmsNotInCrm.stats?.totalUsers || 0}
                    label="Total Users"
                    variant="warning"
                    size="small"
                  />
                  <StatCard
                    icon="📁"
                    value={lmsNotInCrm.stats?.groupsAffected || 0}
                    label="Groups Affected"
                    variant="default"
                    size="small"
                  />
                  <StatCard
                    icon="✓"
                    value={lmsNotInCrm.stats?.activeUsers || 0}
                    label="Active Users"
                    variant="success"
                    size="small"
                  />
                  <StatCard
                    icon="🎓"
                    value={lmsNotInCrm.stats?.totalCompletions || 0}
                    label="Total Completions"
                    variant="primary"
                    size="small"
                  />
                </StatsRow>
              </div>
              <div className="report-actions">
                <span className="count">{lmsNotInCrm.users?.length || 0} LMS users in groups but NOT in CRM</span>
                <button onClick={() => exportToCsv(lmsNotInCrm.users || [], 'lms-users-not-in-crm')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => requestSort('first_name')}>Name{getSortIndicator('first_name')}</th>
                    <th className="sortable" onClick={() => requestSort('email')}>Email{getSortIndicator('email')}</th>
                    <th className="sortable" onClick={() => requestSort('lms_status')}>Status{getSortIndicator('lms_status')}</th>
                    <th className="sortable" onClick={() => requestSort('group_count')}>Groups{getSortIndicator('group_count')}</th>
                    <th className="sortable" onClick={() => requestSort('group_names')}>Group Names{getSortIndicator('group_names')}</th>
                    <th className="sortable" onClick={() => requestSort('completed_courses')}>Courses{getSortIndicator('completed_courses')}</th>
                    <th className="sortable" onClick={() => requestSort('total_npcu')}>NPCU{getSortIndicator('total_npcu')}</th>
                    <th className="sortable" onClick={() => requestSort('last_active_at')}>Last Active{getSortIndicator('last_active_at')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(lmsNotInCrm.users || []).map(row => (
                    <tr key={row.lms_user_id}>
                      <td>{row.first_name} {row.last_name}</td>
                      <td>{row.email}</td>
                      <td><StatusChip status={row.lms_status === 'active' ? 'success' : 'warning'} label={row.lms_status} /></td>
                      <td>{row.group_count}</td>
                      <td className="group-names-cell" title={row.group_names}>{row.group_names}</td>
                      <td>{row.completed_courses}</td>
                      <td><strong>{row.total_npcu}</strong></td>
                      <td>{formatDate(row.last_active_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Partners Without Groups Report */}
          {activeReport === 'no-groups' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{partnersWithoutGroups.length} partners without LMS groups</span>
                <button onClick={() => exportToCsv(partnersWithoutGroups, 'partners-without-groups')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => requestSort('account_name')}>Partner Name{getSortIndicator('account_name')}</th>
                    <th className="sortable" onClick={() => requestSort('partner_tier')}>Tier{getSortIndicator('partner_tier')}</th>
                    <th className="sortable" onClick={() => requestSort('account_region')}>Region{getSortIndicator('account_region')}</th>
                    <th className="sortable" onClick={() => requestSort('account_owner')}>Owner{getSortIndicator('account_owner')}</th>
                    <th className="sortable" onClick={() => requestSort('contact_count')}>Contacts{getSortIndicator('contact_count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(partnersWithoutGroups).map(row => (
                    <tr key={row.id}>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.account_region}</td>
                      <td>{row.account_owner}</td>
                      <td>{row.contact_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Certification Gaps Report */}
          {activeReport === 'gaps' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{certGaps.filter(r => r.npcu_gap > 0).length} partners with gaps</span>
                <button onClick={() => exportToCsv(certGaps, 'certification-gaps')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => requestSort('account_name')}>Partner Name{getSortIndicator('account_name')}</th>
                    <th className="sortable" onClick={() => requestSort('partner_tier')}>Tier{getSortIndicator('partner_tier')}</th>
                    <th className="sortable" onClick={() => requestSort('account_region')}>Region{getSortIndicator('account_region')}</th>
                    <th className="sortable" onClick={() => requestSort('current_npcu')}>Current NPCU{getSortIndicator('current_npcu')}</th>
                    <th className="sortable" onClick={() => requestSort('required_npcu')}>Required{getSortIndicator('required_npcu')}</th>
                    <th className="sortable" onClick={() => requestSort('npcu_gap')}>Gap{getSortIndicator('npcu_gap')}</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(certGaps).map(row => (
                    <tr key={row.id} className={row.npcu_gap > 0 ? 'has-gap' : ''}>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.account_region}</td>
                      <td className="npcu">{row.current_npcu}</td>
                      <td>{row.required_npcu}</td>
                      <td className={row.npcu_gap > 0 ? 'gap negative' : 'gap'}>
                        {row.npcu_gap > 0 ? `-${row.npcu_gap}` : '✓'}
                      </td>
                      <td>
                        {row.npcu_gap > 0 ? (
                          <span className="status not-compliant">Needs {row.npcu_gap} more</span>
                        ) : (
                          <span className="status compliant">Compliant</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Partner Leaderboard Report */}
          {activeReport === 'leaderboard' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{leaderboard.length} partners</span>
                <button onClick={() => exportToCsv(leaderboard, 'partner-leaderboard')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sortable" onClick={() => requestSort('account_name')}>Partner Name{getSortIndicator('account_name')}</th>
                    <th className="sortable" onClick={() => requestSort('partner_tier')}>Tier{getSortIndicator('partner_tier')}</th>
                    <th className="sortable" onClick={() => requestSort('account_region')}>Region{getSortIndicator('account_region')}</th>
                    <th className="sortable" onClick={() => requestSort('total_contacts')}>Contacts{getSortIndicator('total_contacts')}</th>
                    <th className="sortable" onClick={() => requestSort('contacts_in_lms')}>In LMS{getSortIndicator('contacts_in_lms')}</th>
                    <th className="sortable" onClick={() => requestSort('total_certifications')}>Certs{getSortIndicator('total_certifications')}</th>
                    <th className="sortable" onClick={() => requestSort('total_npcu')}>NPCU{getSortIndicator('total_npcu')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(leaderboard).map((row, idx) => (
                    <tr key={row.id}>
                      <td className="rank">{idx + 1}</td>
                      <td>{row.account_name}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier}</span></td>
                      <td>{row.account_region}</td>
                      <td>{row.total_contacts}</td>
                      <td>{row.contacts_in_lms}</td>
                      <td>{row.total_certifications}</td>
                      <td className="npcu">{row.total_npcu}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Popular Courses Report */}
          {activeReport === 'courses' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{coursePopularity.length} courses</span>
                <button onClick={() => exportToCsv(coursePopularity, 'popular-courses')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="sortable" onClick={() => requestSort('name')}>Course Name{getSortIndicator('name')}</th>
                    <th className="sortable" onClick={() => requestSort('product_category')}>Category{getSortIndicator('product_category')}</th>
                    <th className="sortable" onClick={() => requestSort('npcu_value')}>NPCU{getSortIndicator('npcu_value')}</th>
                    <th className="sortable" onClick={() => requestSort('completion_count')}>Completions{getSortIndicator('completion_count')}</th>
                    <th className="sortable" onClick={() => requestSort('unique_users')}>Unique Users{getSortIndicator('unique_users')}</th>
                    <th className="sortable" onClick={() => requestSort('avg_score')}>Avg Score{getSortIndicator('avg_score')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortData(coursePopularity).map((row, idx) => (
                    <tr key={row.id}>
                      <td className="rank">{idx + 1}</td>
                      <td>
                        {row.name}
                        {row.is_certification === 1 && <span className="cert-badge" title="Certification">🎓</span>}
                      </td>
                      <td>{row.product_category || '-'}</td>
                      <td className="npcu">{row.npcu_value || 0}</td>
                      <td>{row.completion_count}</td>
                      <td>{row.unique_users}</td>
                      <td>{row.avg_score ? `${Math.round(row.avg_score)}%` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Activity Report */}
          {activeReport === 'activity' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{recentActivity.length} completions</span>
                <button onClick={() => exportToCsv(recentActivity, 'recent-activity')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Course</th>
                    <th>NPCU</th>
                    <th>Partner</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.map(row => (
                    <tr key={row.enrollment_id}>
                      <td>{formatDate(row.completed_at)}</td>
                      <td>{row.user_name}</td>
                      <td>{row.email}</td>
                      <td>
                        {row.course_name}
                        {row.is_certification === 1 && <span className="cert-badge" title="Certification">🎓</span>}
                      </td>
                      <td className="npcu">{row.npcu_value || 0}</td>
                      <td>{row.partner_name || '-'}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier || '-'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Expiring Certifications Report */}
          {activeReport === 'expiring' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{expiringCerts.length} expiring soon</span>
                <button onClick={() => exportToCsv(expiringCerts, 'expiring-certifications')}>
                  📥 Export CSV
                </button>
              </div>
              {expiringCerts.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">✅</span>
                  <p>No certifications expiring in the next 90 days!</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Expires</th>
                      <th>Days Left</th>
                      <th>User</th>
                      <th>Email</th>
                      <th>Certification</th>
                      <th>Partner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringCerts.map(row => (
                      <tr key={row.enrollment_id} className={row.days_until_expiry <= 30 ? 'urgent' : ''}>
                        <td>{formatDate(row.expires_at)}</td>
                        <td className={row.days_until_expiry <= 30 ? 'expiring-soon' : ''}>{row.days_until_expiry} days</td>
                        <td>{row.user_name}</td>
                        <td>{row.email}</td>
                        <td>{row.course_name}</td>
                        <td>{row.partner_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Inactive Users Report */}
          {activeReport === 'inactive' && (
            <div className="table-report">
              <div className="report-actions">
                <span className="count">{inactiveUsers.length} inactive users</span>
                <button onClick={() => exportToCsv(inactiveUsers, 'inactive-users')}>
                  📥 Export CSV
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Last Active</th>
                    <th>Days Inactive</th>
                    <th>Completions</th>
                    <th>Partner</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {inactiveUsers.map(row => (
                    <tr key={row.lms_user_id}>
                      <td>{row.user_name}</td>
                      <td>{row.email}</td>
                      <td>{formatDate(row.last_active_at)}</td>
                      <td>{row.days_inactive || '180+'}</td>
                      <td>{row.total_completions}</td>
                      <td>{row.partner_name || '-'}</td>
                      <td><span className={`tier-badge ${row.partner_tier?.toLowerCase()}`}>{row.partner_tier || '-'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            </div>
          )}
        </>
      )}
    </PageContent>
  );
}

export default DatabaseReports;
