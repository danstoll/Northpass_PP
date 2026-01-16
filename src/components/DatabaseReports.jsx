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
  Tooltip,
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
  Timeline,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  DonutLarge,
  InfoOutlined,
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
  SearchInput,
  FilterSelect,
  DataTable,
} from './ui/NintexUI';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from 'recharts';
import PartnerUsersReport from './PartnerUsersReport';
import ActivityTimeline from './ActivityTimeline';
import './DatabaseReports.css';

// ===========================================
// METRIC DEFINITIONS FOR INFO TOOLTIPS
// ===========================================
const METRIC_DEFINITIONS = {
  // Landing Page Stats
  partners: {
    title: 'Partners',
    description: 'Total number of active partner companies in the database.',
    details: ['Imported from Impartner CRM', 'Excludes inactive partners']
  },
  contacts: {
    title: 'Contacts',
    description: 'Total number of contacts across all partner companies.',
    details: ['All CRM contacts for active partners', 'May not all be registered in LMS']
  },
  lmsUsers: {
    title: 'LMS Users',
    description: 'Total users registered in the Northpass learning management system.',
    details: ['Includes all registered learners', 'Synced from Northpass API']
  },
  linked: {
    title: 'Linked',
    description: 'CRM contacts who are also registered in the LMS.',
    formula: 'Contacts matched by email to LMS users',
    details: ['Shows CRM-to-LMS connection rate', 'Key metric for adoption']
  },
  // Chart Metrics
  tierDistribution: {
    title: 'Partners by Tier',
    description: 'Distribution of partners across tier levels.',
    details: [
      'Premier Plus: Top tier (20+ NPCU)',
      'Premier: High tier (20+ NPCU)',
      'Select: Mid tier (10+ NPCU)',
      'Certified: Entry tier',
      'Registered: Basic tier (5+ NPCU)'
    ]
  },
  lmsCoverage: {
    title: 'LMS Coverage',
    description: 'Percentage of CRM contacts registered in the LMS.',
    formula: '(Contacts in LMS ÷ Total Contacts) × 100',
    details: ['Higher = better adoption', 'Target: 60%+ coverage']
  },
  regionalDistribution: {
    title: 'Partners by Region',
    description: 'Geographic distribution of partner companies.',
    details: ['Based on CRM account region field', 'Helps identify regional gaps']
  },
  topOwners: {
    title: 'Top Account Owners',
    description: 'Account owners with the most assigned partners.',
    details: ['Shows portfolio distribution', 'Click for detailed owner report']
  },
  // Overview Report Columns
  tier: {
    title: 'Partner Tier',
    description: 'Partner classification level based on certification achievement.',
    details: ['Premier Plus/Premier: 20+ NPCU', 'Select: 10+ NPCU', 'Registered: 5+ NPCU']
  },
  coverage: {
    title: 'Coverage',
    description: 'Percentage of contacts registered in the LMS.',
    formula: '(In LMS ÷ Contacts) × 100',
    details: ['Green: 50%+ coverage', 'Red: Below 50%', 'Target: 60%+']
  },
  region: {
    title: 'Region',
    description: 'Geographic region of the partner account.',
    details: ['From Impartner CRM account region', 'Used for regional reporting']
  },
  owner: {
    title: 'Account Owner',
    description: 'Nintex account manager responsible for the partner.',
    details: ['From Impartner CRM', 'Click Owner Report for details']
  },
  // Report Metrics
  npcu: {
    title: 'NPCU',
    description: 'Nintex Partner Certification Units - measures certification achievement.',
    formula: 'Sum of NPCU values from completed certifications',
    details: ['Only valid (non-expired) certs count', 'Higher = more certified staff']
  },
  certGap: {
    title: 'Certification Gap',
    description: 'NPCU shortfall to meet tier requirements.',
    formula: 'Required NPCU - Current NPCU',
    details: ['Positive = needs more certifications', 'Zero = tier compliant']
  },
  completions: {
    title: 'Course Completions',
    description: 'Number of completed course enrollments.',
    details: ['Includes all course types', 'Only completed status counts']
  },
  inLms: {
    title: 'In LMS',
    description: 'Contacts who are registered in the learning system.',
    details: ['Have active Northpass accounts', 'Can access courses']
  },
  courses: {
    title: 'Completed Courses',
    description: 'Number of courses the user has completed.',
    details: ['All course types included', 'Not all courses grant NPCU']
  },
  certs: {
    title: 'Certifications',
    description: 'Number of certification courses completed.',
    details: ['Only courses with NPCU value > 0', 'May expire after 24 months']
  },
  status: {
    title: 'LMS Status',
    description: 'Whether the contact is registered in the Northpass LMS.',
    details: ['In LMS: Has active account', 'Not in LMS: Needs to register']
  },
  // Leaderboard
  totalContacts: {
    title: 'Total Contacts',
    description: 'Number of contacts in CRM for this partner.',
    details: ['All contacts associated with partner', 'From Impartner sync']
  },
  contactsInLms: {
    title: 'In LMS',
    description: 'Number of partner contacts registered in Northpass.',
    details: ['Shows adoption rate', 'Compare to Total Contacts']
  },
  totalCerts: {
    title: 'Certifications',
    description: 'Total certification completions across all partner users.',
    details: ['Only courses with NPCU value', 'Counts valid certs only']
  },
  // Certification Gaps
  currentNpcu: {
    title: 'Current NPCU',
    description: 'Partner\'s total NPCU from valid certifications.',
    formula: 'Sum of NPCU from non-expired certs',
    details: ['Updated via LMS sync', 'Expired certs not counted']
  },
  requiredNpcu: {
    title: 'Required NPCU',
    description: 'Minimum NPCU needed to maintain tier.',
    details: ['Premier: 20 NPCU', 'Select: 10 NPCU', 'Registered: 5 NPCU']
  },
  gap: {
    title: 'Gap',
    description: 'Difference between required and current NPCU.',
    formula: 'Required NPCU - Current NPCU',
    details: ['Negative = needs more certs', 'Zero/Positive = compliant']
  },
  complianceStatus: {
    title: 'Compliance Status',
    description: 'Whether partner meets tier NPCU requirements.',
    details: ['Compliant: Meets requirements', 'Needs X more: Shortfall amount']
  },
  // Popular Courses
  courseName: {
    title: 'Course Name',
    description: 'Name of the course in Northpass.',
    details: ['🎓 indicates certification course', 'Grants NPCU on completion']
  },
  category: {
    title: 'Category',
    description: 'Product category the course belongs to.',
    details: ['Nintex Automation Cloud', 'Nintex Process Platform', 'K2', 'Others']
  },
  courseNpcu: {
    title: 'NPCU Value',
    description: 'NPCU points awarded for completing this course.',
    details: ['0 = Not a certification', '1-2 = Certification course']
  },
  completionCount: {
    title: 'Completions',
    description: 'Total number of times this course was completed.',
    details: ['Counts all completions', 'Same user can complete multiple times']
  },
  uniqueUsers: {
    title: 'Unique Users',
    description: 'Number of distinct users who completed this course.',
    details: ['Each user counted once', 'Shows course reach']
  },
  avgScore: {
    title: 'Avg Score',
    description: 'Average assessment score for this course.',
    details: ['Percentage score', 'Only if course has assessment']
  },
  // Recent Activity
  completedDate: {
    title: 'Completed Date',
    description: 'Date the course was completed.',
    details: ['From Northpass enrollment data', 'Used for activity tracking']
  },
  // Expiring Certs
  expiresDate: {
    title: 'Expires',
    description: 'Date when the certification expires.',
    formula: 'Completion Date + 24 months',
    details: ['Certification is valid until this date', 'Requires renewal after']
  },
  daysLeft: {
    title: 'Days Left',
    description: 'Number of days until certification expires.',
    details: ['Red = 30 days or less', 'Renewal recommended soon']
  },
  // Inactive Users
  daysInactive: {
    title: 'Days Inactive',
    description: 'Number of days since last LMS activity.',
    formula: 'Today - Last Active Date',
    details: ['180+ days = potentially dormant', 'Consider follow-up outreach']
  },
  lastActive: {
    title: 'Last Active',
    description: 'Date of last activity in the LMS.',
    details: ['Login, course progress, completion', 'From Northpass data']
  },
  // LMS Not in CRM
  groupCount: {
    title: 'Groups',
    description: 'Number of LMS groups the user belongs to.',
    details: ['Partner groups in Northpass', 'Shows group membership']
  },
  groupNames: {
    title: 'Group Names',
    description: 'Names of the LMS groups the user is in.',
    details: ['Partner-specific groups', 'Used to identify partner association']
  }
};

// Info tooltip component
const InfoTooltip = ({ metricKey }) => {
  const metric = METRIC_DEFINITIONS[metricKey];
  if (!metric) return null;
  
  return (
    <Tooltip
      title={
        <Box sx={{ p: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
            {metric.title}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {metric.description}
          </Typography>
          {metric.formula && (
            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.8)', mb: 1 }}>
              {metric.formula}
            </Typography>
          )}
          {metric.details && metric.details.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2, fontSize: '0.75rem' }}>
              {metric.details.map((detail, i) => (
                <li key={i}>{detail}</li>
              ))}
            </Box>
          )}
        </Box>
      }
      arrow
      placement="top"
    >
      <IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7, '&:hover': { opacity: 1 } }}>
        <InfoOutlined sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
};
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
            <RechartsTooltip 
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
      case 'partner-users':
        // Partner Users has its own component
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
    { id: 'activity-timeline', icon: <Timeline />, title: 'Activity Timeline', desc: 'Track enrollment & certification trends with anomaly detection.', category: 'partners', featured: true },
    { id: 'partner-users', icon: <School />, title: 'Partner Users', desc: 'All partner LMS users with enrollments, certifications & NPCU.', category: 'users' },
    { id: 'certifications', icon: <School />, title: 'User Certifications', desc: 'All contacts with certification data.', category: 'users' },
    { id: 'not-in-lms', icon: <PersonOff />, title: 'Contacts Not in LMS', desc: 'CRM contacts not in learning system.', category: 'users' },
    { id: 'lms-not-in-crm', icon: <PersonOff />, title: 'LMS Users Not in CRM', desc: 'LMS users in groups but missing from Salesforce.', category: 'users' },
    { id: 'inactive', icon: <Hotel />, title: 'Inactive Users', desc: 'Users with no recent activity.', category: 'users' },
    { id: 'courses', icon: <MenuBook />, title: 'Popular Courses', desc: 'Most completed courses.', category: 'courses' },
    { id: 'activity', icon: <Schedule />, title: 'Recent Activity', desc: 'Latest course completions.', category: 'courses' },
    { id: 'expiring', icon: <AccessTime />, title: 'Expiring Certifications', desc: 'Certifications expiring soon.', category: 'courses' },
  ];

  // Render Activity Timeline as its own full-page view
  if (activeReport === 'activity-timeline') {
    return <ActivityTimeline onBack={backToLanding} />;
  }

  // Render Partner Users Report as its own full-page view
  if (activeReport === 'partner-users') {
    return <PartnerUsersReport onBack={backToLanding} />;
  }

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
              label={<>Partners <InfoTooltip metricKey="partners" /></>}
              variant="primary"
              size="small"
            />
            <StatCard
              icon="👤"
              value={quickStats?.contacts || 0}
              label={<>Contacts <InfoTooltip metricKey="contacts" /></>}
              variant="default"
              size="small"
            />
            <StatCard
              icon="🎓"
              value={quickStats?.lmsUsers || 0}
              label={<>LMS Users <InfoTooltip metricKey="lmsUsers" /></>}
              variant="default"
              size="small"
            />
            <StatCard
              icon="🔗"
              value={quickStats?.linkedContacts || 0}
              label={<>Linked <InfoTooltip metricKey="linked" /></>}
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
                      title={<>Partners by Tier <InfoTooltip metricKey="tierDistribution" /></>}
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
                      <InfoTooltip metricKey="lmsCoverage" />
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
                      title={<>Partners by Region <InfoTooltip metricKey="regionalDistribution" /></>}
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
                      title={<>Top Account Owners <InfoTooltip metricKey="topOwners" /></>}
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
            <SectionCard title="Filters" icon="🔍">
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                {['certifications', 'not-in-lms', 'gaps', 'leaderboard'].includes(activeReport) && (
                  <FilterSelect
                    label="Tier"
                    value={selectedTier}
                    onChange={setSelectedTier}
                    options={filters.tiers.map(t => ({ value: t, label: t }))}
                    minWidth={150}
                  />
                )}
                
                {['certifications', 'not-in-lms', 'leaderboard'].includes(activeReport) && (
                  <FilterSelect
                    label="Region"
                    value={selectedRegion}
                    onChange={setSelectedRegion}
                    options={filters.regions.map(r => ({ value: r, label: r }))}
                    minWidth={180}
                  />
                )}
                
                {activeReport === 'not-in-lms' && (
                  <FilterSelect
                    label="Owner"
                    value={selectedOwner}
                    onChange={setSelectedOwner}
                    options={filters.owners.map(o => ({ value: o, label: o }))}
                    minWidth={200}
                  />
                )}
                
                {['certifications', 'lms-not-in-crm'].includes(activeReport) && (
                  <SearchInput
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onClear={() => setSearchTerm('')}
                    placeholder="Search name, email, company..."
                    fullWidth={false}
                    sx={{ minWidth: 280 }}
                  />
                )}
                
                {activeReport === 'activity' && (
                  <FilterSelect
                    label="Time Period"
                    value={daysFilter.toString()}
                    onChange={(val) => setDaysFilter(parseInt(val) || 30)}
                    options={[
                      { value: '7', label: 'Last 7 days' },
                      { value: '14', label: 'Last 14 days' },
                      { value: '30', label: 'Last 30 days' },
                      { value: '60', label: 'Last 60 days' },
                      { value: '90', label: 'Last 90 days' },
                    ]}
                    minWidth={150}
                  />
                )}
                
                <ActionButton onClick={() => runReport(activeReport)}>
                  🔄 Run Report
                </ActionButton>
                
                {(selectedTier || selectedRegion || selectedOwner || searchTerm) && (
                  <ActionButton
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setSelectedTier('');
                      setSelectedRegion('');
                      setSelectedOwner('');
                      setSearchTerm('');
                    }}
                  >
                    Clear Filters
                  </ActionButton>
                )}
              </Box>
            </SectionCard>
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
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="🏢" value={overview.totals?.total_partners || 0} label={<>Partners <InfoTooltip metricKey="partners" /></>} variant="primary" />
                <StatCard icon="👥" value={overview.totals?.total_contacts || 0} label={<>Contacts <InfoTooltip metricKey="totalContacts" /></>} />
                <StatCard icon="📚" value={overview.totals?.lms_linked_contacts || 0} label={<>In LMS <InfoTooltip metricKey="inLms" /></>} variant="success" />
                <StatCard icon="👤" value={overview.totals?.total_lms_users || 0} label={<>LMS Users <InfoTooltip metricKey="lmsUsers" /></>} />
              </StatsRow>

              {/* Tier Distribution */}
              <SectionCard title="By Partner Tier" icon="📊" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary">
                    <InfoTooltip metricKey="tierDistribution" /> Distribution of partners and contacts by tier
                  </Typography>
                </Box>
                <DataTable
                  columns={[
                    { id: 'tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => val ? <TierBadge tier={val} /> : '-' },
                    { id: 'partner_count', label: 'Partners', align: 'center' },
                    { id: 'contact_count', label: 'Contacts', align: 'center' },
                    { id: 'lms_linked_count', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>In LMS <InfoTooltip metricKey="inLms" /></Box>, align: 'center' },
                    { id: 'coverage', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Coverage <InfoTooltip metricKey="coverage" /></Box>, align: 'center', sortable: false, render: (val, row) => {
                      const pct = row.contact_count > 0 ? Math.round((row.lms_linked_count / row.contact_count) * 100) : 0;
                      return <StatusChip status={pct > 50 ? 'success' : 'warning'} label={`${pct}%`} />;
                    }},
                  ]}
                  data={overview.byTier || []}
                  emptyMessage="No tier data available"
                />
              </SectionCard>

              {/* Region Distribution */}
              <SectionCard title="By Region" icon="🌍" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary">
                    <InfoTooltip metricKey="regionalDistribution" /> Geographic distribution of partners
                  </Typography>
                </Box>
                <DataTable
                  columns={[
                    { id: 'region', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Region <InfoTooltip metricKey="region" /></Box> },
                    { id: 'partner_count', label: 'Partners', align: 'center' },
                    { id: 'contact_count', label: 'Contacts', align: 'center' },
                    { id: 'lms_linked_count', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>In LMS <InfoTooltip metricKey="inLms" /></Box>, align: 'center' },
                  ]}
                  data={overview.byRegion || []}
                  emptyMessage="No regional data available"
                />
              </SectionCard>

              {/* Top Account Owners */}
              <SectionCard title="Top Account Owners" icon="👤" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2" color="text.secondary">
                    <InfoTooltip metricKey="topOwners" /> Top 10 account owners by partner count
                  </Typography>
                </Box>
                <DataTable
                  columns={[
                    { id: 'owner', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Owner <InfoTooltip metricKey="owner" /></Box> },
                    { id: 'partner_count', label: 'Partners', align: 'center' },
                    { id: 'contact_count', label: 'Contacts', align: 'center' },
                  ]}
                  data={(overview.byOwner || []).slice(0, 10)}
                  emptyMessage="No owner data available"
                />
              </SectionCard>
            </>
          )}

          {/* User Certifications Report */}
          {activeReport === 'certifications' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="👤" value={userCerts.length} label={<>Contacts <InfoTooltip metricKey="contacts" /></>} variant="primary" />
                <StatCard icon="🎓" value={userCerts.reduce((sum, u) => sum + (parseInt(u.certifications) || 0), 0)} label={<>Total Certifications <InfoTooltip metricKey="certs" /></>} variant="success" />
                <StatCard icon="📚" value={userCerts.reduce((sum, u) => sum + (parseInt(u.completed_courses) || 0), 0)} label={<>Courses Completed <InfoTooltip metricKey="courses" /></>} />
                <StatCard icon="🏆" value={userCerts.reduce((sum, u) => sum + (parseInt(u.total_npcu) || 0), 0)} label={<>Total NPCU <InfoTooltip metricKey="npcu" /></>} variant="primary" />
              </StatsRow>

              {/* User Certifications Table */}
              <SectionCard title="User Certification Details" icon="🎓" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {userCerts.length} contacts with certification data
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(userCerts, 'user-certifications')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'first_name', label: 'Name', render: (val, row) => `${val} ${row.last_name}` },
                    { id: 'email', label: 'Email' },
                    { id: 'account_name', label: 'Company' },
                    { id: 'partner_tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => val ? <TierBadge tier={val} /> : '-' },
                    { id: 'completed_courses', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Courses <InfoTooltip metricKey="courses" /></Box>, align: 'center' },
                    { id: 'certifications', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Certs <InfoTooltip metricKey="certs" /></Box>, align: 'center' },
                    { id: 'total_npcu', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>NPCU <InfoTooltip metricKey="npcu" /></Box>, align: 'center', render: (val) => <span style={{ color: parseInt(val) > 0 ? '#43E97B' : 'inherit', fontWeight: 600 }}>{val || 0}</span> },
                    { id: 'lms_user_id', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Status <InfoTooltip metricKey="status" /></Box>, render: (val) => val ? <StatusChip status="success" label="In LMS" /> : <StatusChip status="warning" label="Not in LMS" /> },
                  ]}
                  data={sortData(userCerts)}
                  emptyMessage="No certification data found"
                  sortable={true}
                  orderBy={sortConfig.key}
                  order={sortConfig.direction}
                  onSort={(key) => requestSort(key)}
                />
              </SectionCard>
            </>
          )}

          {/* Contacts Not in LMS Report */}
          {activeReport === 'not-in-lms' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="⚠️" value={notInLms.length} label={<>Not in LMS <InfoTooltip metricKey="notInLms" /></>} variant="warning" />
                <StatCard icon="🏢" value={new Set(notInLms.map(c => c.account_name)).size} label="Partners Affected" />
                <StatCard icon="🌍" value={new Set(notInLms.map(c => c.account_region)).size} label="Regions" />
                <StatCard icon="👤" value={new Set(notInLms.map(c => c.account_owner)).size} label="Account Owners" />
              </StatsRow>

              {/* Not in LMS Table */}
              <SectionCard title="CRM Contacts Not in LMS" icon="⚠️" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {notInLms.length} contacts need LMS accounts
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(notInLms, 'contacts-not-in-lms')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'first_name', label: 'Name', render: (val, row) => `${val} ${row.last_name}` },
                    { id: 'email', label: 'Email' },
                    { id: 'title', label: 'Title', render: (val) => val || '-' },
                    { id: 'account_name', label: 'Company' },
                    { id: 'partner_tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => val ? <TierBadge tier={val} /> : '-' },
                    { id: 'account_region', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Region <InfoTooltip metricKey="region" /></Box> },
                    { id: 'account_owner', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Owner <InfoTooltip metricKey="owner" /></Box> },
                  ]}
                  data={sortData(notInLms)}
                  emptyMessage="All contacts are in LMS"
                  sortable={true}
                  orderBy={sortConfig.key}
                  order={sortConfig.direction}
                  onSort={(key) => requestSort(key)}
                />
              </SectionCard>
            </>
          )}

          {/* LMS Users Not in CRM Report */}
          {activeReport === 'lms-not-in-crm' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard
                  icon="👤"
                  value={lmsNotInCrm.stats?.totalUsers || 0}
                  label={<>Total Users <InfoTooltip metricKey="lmsUsers" /></>}
                  variant="warning"
                />
                <StatCard
                  icon="📁"
                  value={lmsNotInCrm.stats?.groupsAffected || 0}
                  label="Groups Affected"
                />
                <StatCard
                  icon="✓"
                  value={lmsNotInCrm.stats?.activeUsers || 0}
                  label="Active Users"
                  variant="success"
                />
                <StatCard
                  icon="🎓"
                  value={lmsNotInCrm.stats?.totalCompletions || 0}
                  label={<>Total Completions <InfoTooltip metricKey="completions" /></>}
                  variant="primary"
                />
              </StatsRow>

              {/* LMS Not in CRM Table */}
              <SectionCard title="LMS Users Not in CRM" icon="🔍" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {lmsNotInCrm.users?.length || 0} LMS users in partner groups but NOT in CRM
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(lmsNotInCrm.users || [], 'lms-users-not-in-crm')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'first_name', label: 'Name', render: (val, row) => `${val} ${row.last_name}` },
                    { id: 'email', label: 'Email' },
                    { id: 'lms_status', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Status <InfoTooltip metricKey="status" /></Box>, render: (val) => <StatusChip status={val === 'active' ? 'success' : 'warning'} label={val} /> },
                    { id: 'group_count', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Groups <InfoTooltip metricKey="groupCount" /></Box>, align: 'center' },
                    { id: 'group_names', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Group Names <InfoTooltip metricKey="groupNames" /></Box>, render: (val) => <span title={val} style={{ maxWidth: 200, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span> },
                    { id: 'completed_courses', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Courses <InfoTooltip metricKey="courses" /></Box>, align: 'center' },
                    { id: 'total_npcu', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>NPCU <InfoTooltip metricKey="npcu" /></Box>, align: 'center', render: (val) => <span style={{ fontWeight: 600 }}>{val || 0}</span> },
                    { id: 'last_active_at', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Last Active <InfoTooltip metricKey="lastActive" /></Box>, render: (val) => formatDate(val) },
                  ]}
                  data={sortData(lmsNotInCrm.users || [])}
                  emptyMessage="All LMS users are in CRM"
                  sortable={true}
                  orderBy={sortConfig.key}
                  order={sortConfig.direction}
                  onSort={(key) => requestSort(key)}
                />
              </SectionCard>
            </>
          )}

          {/* Partners Without Groups Report */}
          {activeReport === 'no-groups' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="⚠️" value={partnersWithoutGroups.length} label={<>Partners Without Groups <InfoTooltip metricKey="partnersWithoutGroups" /></>} variant="warning" />
                <StatCard icon="👥" value={partnersWithoutGroups.reduce((sum, p) => sum + (parseInt(p.contact_count) || 0), 0)} label={<>Contacts Affected <InfoTooltip metricKey="contacts" /></>} />
                <StatCard icon="🌍" value={new Set(partnersWithoutGroups.map(p => p.account_region)).size} label="Regions" />
                <StatCard icon="👤" value={new Set(partnersWithoutGroups.map(p => p.account_owner)).size} label="Account Owners" />
              </StatsRow>

              {/* Partners Without Groups Table */}
              <SectionCard title="Partners Needing LMS Groups" icon="📁" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {partnersWithoutGroups.length} partners need LMS group setup
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(partnersWithoutGroups, 'partners-without-groups')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'account_name', label: 'Partner Name', render: (val) => <span style={{ fontWeight: 500 }}>{val}</span> },
                    { id: 'partner_tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => val ? <TierBadge tier={val} /> : '-' },
                    { id: 'account_region', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Region <InfoTooltip metricKey="region" /></Box> },
                    { id: 'account_owner', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Owner <InfoTooltip metricKey="owner" /></Box> },
                    { id: 'contact_count', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Contacts <InfoTooltip metricKey="contacts" /></Box>, align: 'center' },
                  ]}
                  data={sortData(partnersWithoutGroups)}
                  emptyMessage="All partners have LMS groups"
                  sortable={true}
                  orderBy={sortConfig.key}
                  order={sortConfig.direction}
                  onSort={(key) => requestSort(key)}
                />
              </SectionCard>
            </>
          )}

          {/* Certification Gaps Report */}
          {activeReport === 'gaps' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard 
                  icon="⚠️" 
                  value={certGaps.filter(r => r.npcu_gap > 0).length} 
                  label={<>Partners with Gaps <InfoTooltip metricKey="gap" /></>} 
                  variant={certGaps.filter(r => r.npcu_gap > 0).length > 0 ? 'warning' : 'success'} 
                />
                <StatCard 
                  icon="✅" 
                  value={certGaps.filter(r => r.npcu_gap <= 0).length} 
                  label="Compliant Partners" 
                  variant="success" 
                />
                <StatCard 
                  icon="📊" 
                  value={certGaps.reduce((sum, r) => sum + Math.max(r.npcu_gap, 0), 0)} 
                  label="Total NPCU Gap" 
                  variant="error" 
                />
                <StatCard 
                  icon="🏆" 
                  value={certGaps.reduce((sum, r) => sum + (parseInt(r.current_npcu) || 0), 0)} 
                  label={<>Total Current NPCU <InfoTooltip metricKey="currentNpcu" /></>} 
                  variant="primary" 
                />
              </StatsRow>

              {/* Certification Gaps Table */}
              <SectionCard title="Partner Tier Compliance Status" icon="📋" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {certGaps.filter(r => r.npcu_gap > 0).length} of {certGaps.length} partners below tier requirements
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(certGaps, 'certification-gaps')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'account_name', label: 'Partner Name', render: (val) => <span style={{ fontWeight: 500 }}>{val}</span> },
                    { id: 'partner_tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => val ? <TierBadge tier={val} /> : '-' },
                    { id: 'account_region', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Region <InfoTooltip metricKey="region" /></Box> },
                    { id: 'current_npcu', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Current NPCU <InfoTooltip metricKey="currentNpcu" /></Box>, align: 'center', render: (val) => <span style={{ color: parseInt(val) > 0 ? '#43E97B' : 'inherit', fontWeight: 600 }}>{val || 0}</span> },
                    { id: 'required_npcu', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Required <InfoTooltip metricKey="requiredNpcu" /></Box>, align: 'center' },
                    { id: 'npcu_gap', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Gap <InfoTooltip metricKey="gap" /></Box>, align: 'center', render: (val) => val > 0 ? <StatusChip status="error" label={`-${val}`} /> : <StatusChip status="success" label="✓" /> },
                    { id: 'status', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Status <InfoTooltip metricKey="complianceStatus" /></Box>, sortable: false, render: (val, row) => row.npcu_gap > 0 ? <StatusChip status="warning" label={`Needs ${row.npcu_gap} more`} /> : <StatusChip status="success" label="Compliant" /> },
                  ]}
                  data={sortData(certGaps)}
                  emptyMessage="No partners found"
                  sortable={true}
                  orderBy={sortConfig.key}
                  order={sortConfig.direction}
                  onSort={(key) => requestSort(key)}
                />
              </SectionCard>
            </>
          )}

          {/* Partner Leaderboard Report */}
          {activeReport === 'leaderboard' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="🏢" value={leaderboard.length} label={<>Partners <InfoTooltip metricKey="partners" /></>} variant="primary" />
                <StatCard icon="👥" value={leaderboard.reduce((sum, p) => sum + (parseInt(p.total_contacts) || 0), 0)} label={<>Total Contacts <InfoTooltip metricKey="totalContacts" /></>} />
                <StatCard icon="📚" value={leaderboard.reduce((sum, p) => sum + (parseInt(p.contacts_in_lms) || 0), 0)} label={<>In LMS <InfoTooltip metricKey="inLms" /></>} variant="success" />
                <StatCard icon="🏆" value={leaderboard.reduce((sum, p) => sum + (parseInt(p.total_npcu) || 0), 0)} label={<>Total NPCU <InfoTooltip metricKey="npcu" /></>} variant="primary" />
              </StatsRow>

              {/* Partners Table */}
              <SectionCard title="Partner Rankings" icon="📋" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {leaderboard.length} partners ranked by NPCU
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(leaderboard, 'partner-leaderboard')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'rank', label: '#', align: 'center', sortable: false },
                    { id: 'account_name', label: 'Partner Name', render: (val) => <span style={{ fontWeight: 500 }}>{val}</span> },
                    { id: 'partner_tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => <TierBadge tier={val || 'Unknown'} /> },
                    { id: 'account_region', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Region <InfoTooltip metricKey="region" /></Box>, render: (val) => val || 'N/A' },
                    { id: 'total_contacts', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Contacts <InfoTooltip metricKey="totalContacts" /></Box>, align: 'center', render: (val) => parseInt(val) || 0 },
                    { id: 'contacts_in_lms', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>In LMS <InfoTooltip metricKey="contactsInLms" /></Box>, align: 'center', render: (val) => parseInt(val) || 0 },
                    { id: 'total_certifications', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Certs <InfoTooltip metricKey="totalCerts" /></Box>, align: 'center', render: (val) => parseInt(val) || 0 },
                    { id: 'total_npcu', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>NPCU <InfoTooltip metricKey="npcu" /></Box>, align: 'center', render: (val) => <span style={{ color: parseInt(val) > 0 ? '#43E97B' : 'inherit', fontWeight: 600 }}>{parseInt(val) || 0}</span> },
                  ]}
                  data={sortData(leaderboard).map((row, idx) => ({ ...row, rank: idx + 1 }))}
                  emptyMessage="No partners found"
                  sortable={true}
                  orderBy={sortConfig.key}
                  order={sortConfig.direction}
                  onSort={(key) => requestSort(key)}
                />
              </SectionCard>
            </>
          )}

          {/* Popular Courses Report */}
          {activeReport === 'courses' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="📚" value={coursePopularity.length} label={<>Courses <InfoTooltip metricKey="courseName" /></>} variant="primary" />
                <StatCard icon="🎓" value={coursePopularity.filter(c => c.is_certification === 1).length} label={<>Certifications <InfoTooltip metricKey="certificationCourse" /></>} variant="success" />
                <StatCard icon="✅" value={coursePopularity.reduce((sum, c) => sum + (parseInt(c.completion_count) || 0), 0)} label={<>Total Completions <InfoTooltip metricKey="completionCount" /></>} />
                <StatCard icon="🏆" value={coursePopularity.reduce((sum, c) => sum + (parseInt(c.npcu_value) || 0), 0)} label={<>Total NPCU Value <InfoTooltip metricKey="courseNpcu" /></>} variant="primary" />
              </StatsRow>

              {/* Courses Table */}
              <SectionCard title="Course Popularity Rankings" icon="📚" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {coursePopularity.length} courses sorted by completions
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(coursePopularity, 'popular-courses')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'rank', label: '#', align: 'center', sortable: false },
                    { id: 'name', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Course Name <InfoTooltip metricKey="courseName" /></Box>, render: (val, row) => (
                      <>
                        {val}
                        {row.is_certification === 1 && <span title="Certification" style={{ marginLeft: 4 }}>🎓</span>}
                      </>
                    )},
                    { id: 'product_category', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Category <InfoTooltip metricKey="category" /></Box>, render: (val) => val || '-' },
                    { id: 'npcu_value', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>NPCU <InfoTooltip metricKey="courseNpcu" /></Box>, align: 'center', render: (val) => <span style={{ color: parseInt(val) > 0 ? '#43E97B' : 'inherit', fontWeight: 600 }}>{val || 0}</span> },
                    { id: 'completion_count', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Completions <InfoTooltip metricKey="completionCount" /></Box>, align: 'center' },
                    { id: 'unique_users', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Unique Users <InfoTooltip metricKey="uniqueUsers" /></Box>, align: 'center' },
                    { id: 'avg_score', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>Avg Score <InfoTooltip metricKey="avgScore" /></Box>, align: 'center', render: (val) => val ? `${Math.round(val)}%` : '-' },
                  ]}
                  data={sortData(coursePopularity).map((row, idx) => ({ ...row, rank: idx + 1 }))}
                  emptyMessage="No courses found"
                  sortable={true}
                  orderBy={sortConfig.key}
                  order={sortConfig.direction}
                  onSort={(key) => requestSort(key)}
                />
              </SectionCard>
            </>
          )}

          {/* Recent Activity Report */}
          {activeReport === 'activity' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard icon="📊" value={recentActivity.length} label={<>Recent Completions <InfoTooltip metricKey="completionCount" /></>} variant="primary" />
                <StatCard icon="👤" value={new Set(recentActivity.map(r => r.email)).size} label={<>Unique Users <InfoTooltip metricKey="uniqueUsers" /></>} />
                <StatCard icon="🏢" value={new Set(recentActivity.filter(r => r.partner_name).map(r => r.partner_name)).size} label="Partners Active" variant="success" />
                <StatCard icon="🏆" value={recentActivity.reduce((sum, r) => sum + (parseInt(r.npcu_value) || 0), 0)} label={<>NPCU Earned <InfoTooltip metricKey="npcu" /></>} variant="primary" />
              </StatsRow>

              {/* Activity Table */}
              <SectionCard title="Recent Course Completions" icon="📅" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    Last {recentActivity.length} completions across all partners
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(recentActivity, 'recent-activity')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'completed_at', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Date <InfoTooltip metricKey="completedDate" /></Box>, render: (val) => formatDate(val) },
                    { id: 'user_name', label: 'User' },
                    { id: 'email', label: 'Email' },
                    { id: 'course_name', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Course <InfoTooltip metricKey="courseName" /></Box>, render: (val, row) => (
                      <>
                        {val}
                        {row.is_certification === 1 && <span title="Certification" style={{ marginLeft: 4 }}>🎓</span>}
                      </>
                    )},
                    { id: 'npcu_value', label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>NPCU <InfoTooltip metricKey="npcu" /></Box>, align: 'center', render: (val) => <span style={{ color: parseInt(val) > 0 ? '#43E97B' : 'inherit', fontWeight: 600 }}>{val || 0}</span> },
                    { id: 'partner_name', label: 'Partner', render: (val) => val || '-' },
                    { id: 'partner_tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => val ? <TierBadge tier={val} /> : '-' },
                  ]}
                  data={recentActivity}
                  emptyMessage="No recent activity found"
                />
              </SectionCard>
            </>
          )}

          {/* Expiring Certifications Report */}
          {activeReport === 'expiring' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard 
                  icon="⏰" 
                  value={expiringCerts.length} 
                  label={<>Expiring Soon <InfoTooltip metricKey="expiringCerts" /></>} 
                  variant={expiringCerts.length > 0 ? 'warning' : 'success'} 
                />
                <StatCard 
                  icon="🚨" 
                  value={expiringCerts.filter(c => c.days_until_expiry <= 30).length} 
                  label={<>Critical (&lt;30 days) <InfoTooltip metricKey="daysLeft" /></>} 
                  variant="error" 
                />
                <StatCard 
                  icon="👤" 
                  value={new Set(expiringCerts.map(c => c.email)).size} 
                  label="Affected Users" 
                />
                <StatCard 
                  icon="🏢" 
                  value={new Set(expiringCerts.filter(c => c.partner_name).map(c => c.partner_name)).size} 
                  label="Affected Partners" 
                />
              </StatsRow>

              {/* Expiring Table */}
              <SectionCard title="Certifications Expiring Within 90 Days" icon="⏰" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {expiringCerts.length} certifications expiring
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(expiringCerts, 'expiring-certifications')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                {expiringCerts.length === 0 ? (
                  <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h3" sx={{ mb: 1 }}>✅</Typography>
                    <Typography color="success.main">No certifications expiring in the next 90 days!</Typography>
                  </Box>
                ) : (
                  <DataTable
                    columns={[
                      { id: 'expires_at', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Expires <InfoTooltip metricKey="expiresDate" /></Box>, render: (val) => formatDate(val) },
                      { id: 'days_until_expiry', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Days Left <InfoTooltip metricKey="daysLeft" /></Box>, render: (val) => (
                        <StatusChip 
                          status={val <= 30 ? 'error' : val <= 60 ? 'warning' : 'info'} 
                          label={`${val} days`} 
                        />
                      )},
                      { id: 'user_name', label: 'User' },
                      { id: 'email', label: 'Email' },
                      { id: 'course_name', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Certification <InfoTooltip metricKey="courseName" /></Box> },
                      { id: 'partner_name', label: 'Partner', render: (val) => val || '-' },
                    ]}
                    data={expiringCerts}
                    emptyMessage="No expiring certifications"
                  />
                )}
              </SectionCard>
            </>
          )}

          {/* Inactive Users Report */}
          {activeReport === 'inactive' && (
            <>
              {/* Summary Stats */}
              <StatsRow columns={4}>
                <StatCard 
                  icon="😴" 
                  value={inactiveUsers.length} 
                  label={<>Inactive Users <InfoTooltip metricKey="inactiveUsers" /></>} 
                  variant="warning" 
                />
                <StatCard 
                  icon="📊" 
                  value={inactiveUsers.reduce((sum, u) => sum + (parseInt(u.total_completions) || 0), 0)} 
                  label={<>Total Completions <InfoTooltip metricKey="completions" /></>} 
                />
                <StatCard 
                  icon="📅" 
                  value={inactiveUsers[0]?.days_inactive || 'N/A'} 
                  label={<>Max Days Inactive <InfoTooltip metricKey="daysInactive" /></>} 
                />
                <StatCard 
                  icon="🏢" 
                  value={new Set(inactiveUsers.filter(u => u.partner_name).map(u => u.partner_name)).size} 
                  label="Partners Affected" 
                />
              </StatsRow>

              {/* Inactive Users Table */}
              <SectionCard title="Users Inactive 90+ Days" icon="😴" noPadding>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {inactiveUsers.length} users with no activity in 90+ days
                  </Typography>
                  <ActionButton size="small" onClick={() => exportToCsv(inactiveUsers, 'inactive-users')}>
                    📥 Export CSV
                  </ActionButton>
                </Box>
                <DataTable
                  columns={[
                    { id: 'user_name', label: 'User' },
                    { id: 'email', label: 'Email' },
                    { id: 'last_active_at', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Last Active <InfoTooltip metricKey="lastActive" /></Box>, render: (val) => formatDate(val) },
                    { id: 'days_inactive', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Days Inactive <InfoTooltip metricKey="daysInactive" /></Box>, render: (val) => val || '180+' },
                    { id: 'total_completions', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Completions <InfoTooltip metricKey="completions" /></Box>, align: 'center' },
                    { id: 'partner_name', label: 'Partner', render: (val) => val || '-' },
                    { id: 'partner_tier', label: <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Tier <InfoTooltip metricKey="tier" /></Box>, render: (val) => val ? <TierBadge tier={val} /> : '-' },
                  ]}
                  data={inactiveUsers}
                  emptyMessage="No inactive users found"
                />
              </SectionCard>
            </>
          )}
            </div>
          )}
        </>
      )}
    </PageContent>
  );
}

export default DatabaseReports;
