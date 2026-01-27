/**
 * Analytics Dashboard
 * Trend reporting with MoM/YoY comparisons for KPIs
 * Supports stacked filters: Region, Account Owner, Tier
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, Card, CardContent, Tabs, Tab,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel, Chip, Alert, CircularProgress,
  LinearProgress, Tooltip, IconButton, ToggleButton, ToggleButtonGroup,
  Divider, Slider, Switch, FormControlLabel
} from '@mui/material';
import {
  TrendingUp, TrendingDown, TrendingFlat, People, School, EmojiEvents,
  CalendarMonth, Refresh, Download, Timeline, Assessment, BarChart,
  ArrowUpward, ArrowDownward, Remove, FilterList, Clear, Speed,
  Groups, Map, Person, Warning, CheckCircle, Star, TrendingUp as Rocket,
  Info, EventAvailable, DateRange
} from '@mui/icons-material';
import { PageHeader, PageContent, StatCard, StatsRow, ActionButton, InfoButton } from './ui/NintexUI';
import {
  LineChart, Line, AreaChart, Area, BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine
} from 'recharts';
import './AnalyticsDashboard.css';

// Chart colors matching Nintex brand
const CHART_COLORS = {
  primary: '#FF6B35',
  secondary: '#6B4C9A',
  success: '#28a745',
  info: '#17a2b8',
  warning: '#ffc107',
  danger: '#dc3545',
  thisYear: '#FF6B35',
  lastYear: '#6B4C9A',
  enrollments: '#17a2b8',
  completions: '#28a745',
  certifications: '#FF6B35',
  npcu: '#ffc107'
};

const API_BASE = '/api/db';

// Metric definitions for info tooltips
const METRIC_DEFINITIONS = {
  engagementScore: {
    title: 'Engagement Score',
    description: 'A composite score (0-100) measuring overall partner engagement with the LMS.',
    formula: '(Activation × 25%) + (Completion × 25%) + (Certification Density × 30%) + (Activity × 20%)',
    details: [
      'Activation: % of CRM contacts with LMS accounts',
      'Completion: % of enrollments completed',
      'Certification Density: Certifications per user (scaled)',
      'Activity: Course completions in last 30 days'
    ]
  },
  activationRate: {
    title: 'Activation Rate',
    description: 'Percentage of CRM contacts who have created LMS accounts.',
    formula: '(Contacts with LMS accounts ÷ Total active contacts) × 100',
    details: [
      'Higher is better - indicates partner engagement',
      'Goal: 50%+ activation rate'
    ]
  },
  completionRate: {
    title: 'Completion Rate',
    description: 'Percentage of course enrollments that have been completed.',
    formula: '(Completed enrollments ÷ Total enrollments) × 100',
    details: [
      'Measures learning follow-through',
      'Goal: 70%+ completion rate'
    ]
  },
  certificationDensity: {
    title: 'Certification Density',
    description: 'Average number of certifications (NPCU courses) per group member.',
    formula: 'Total certifications ÷ Group members',
    details: [
      'Only courses with NPCU value > 0 count',
      'Higher density = more certified workforce'
    ]
  },
  npcu: {
    title: 'NPCU (Nintex Partner Certification Units)',
    description: 'Points earned by completing certification courses.',
    formula: 'Sum of NPCU values from completed courses',
    details: [
      'NPCU values: 0 (no cert), 1 (basic), 2 (advanced)',
      'Premier tier requires 20+ NPCU',
      'Select tier requires 10+ NPCU',
      'Registered tier requires 5+ NPCU'
    ]
  },
  complianceRate: {
    title: 'Compliance Rate',
    description: 'Percentage of partners meeting their tier\'s minimum NPCU requirement.',
    formula: '(Compliant partners ÷ Total partners in tier) × 100',
    details: [
      'Premier: minimum 20 NPCU',
      'Select: minimum 10 NPCU',
      'Registered: minimum 5 NPCU'
    ]
  },
  momChange: {
    title: 'Month-over-Month Change',
    description: 'Percentage change compared to the previous month.',
    formula: '((This month - Last month) ÷ Last month) × 100',
    details: [
      'Green ↑ = positive growth',
      'Red ↓ = decline',
      'Gray — = no change'
    ]
  },
  yoyChange: {
    title: 'Year-over-Year Change',
    description: 'Percentage change compared to the same month last year.',
    formula: '((This year - Last year) ÷ Last year) × 100',
    details: [
      'Better for seasonal comparisons',
      'Shows long-term trends'
    ]
  },
  userSegments: {
    title: 'User Segments',
    description: 'Users categorized by their recent activity level.',
    formula: 'Based on last enrollment completion date',
    details: [
      'Active: Activity within 30 days',
      'Recent: Activity 31-90 days ago',
      'Lapsed: Activity 91-180 days ago',
      'Dormant: No activity for 180+ days',
      'Never Active: Registered but never enrolled'
    ]
  },
  tierProgression: {
    title: 'Tier Progression',
    description: 'Partners approaching tier upgrades or at risk of non-compliance.',
    formula: 'Current NPCU vs tier thresholds',
    details: [
      'Close to Upgrade: Within 80% of next tier',
      'At Risk: Below minimum for current tier',
      'Thresholds vary by partner tier'
    ]
  }
};

// Custom chart tooltip
function CustomChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  
  return (
    <Box sx={{ bgcolor: 'background.paper', p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, boxShadow: 2 }}>
      <Typography variant="subtitle2" fontWeight="bold">{label}</Typography>
      {payload.map((entry, index) => (
        <Typography key={index} variant="body2" sx={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
        </Typography>
      ))}
    </Box>
  );
}

// Fiscal Year constants
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FISCAL_QUARTER_MAP = {
  7: 'Q1', 8: 'Q1', 9: 'Q1',   // Jul-Sep = Q1
  10: 'Q2', 11: 'Q2', 12: 'Q2', // Oct-Dec = Q2
  1: 'Q3', 2: 'Q3', 3: 'Q3',   // Jan-Mar = Q3
  4: 'Q4', 5: 'Q4', 6: 'Q4'    // Apr-Jun = Q4
};
const CALENDAR_QUARTER_MAP = {
  1: 'Q1', 2: 'Q1', 3: 'Q1',
  4: 'Q2', 5: 'Q2', 6: 'Q2',
  7: 'Q3', 8: 'Q3', 9: 'Q3',
  10: 'Q4', 11: 'Q4', 12: 'Q4'
};

// Get fiscal year label (e.g., "FY26" or "2024-25")
function getFiscalYearLabel(fyYear) {
  return `FY${fyYear.toString().slice(-2)}`;
}

// Generate months for a date range
function generateMonthRange(startYear, endYear, useFiscal) {
  const months = [];
  if (useFiscal) {
    // Fiscal year: July to June
    for (let year = startYear; year < endYear; year++) {
      // Jul-Dec of first calendar year
      for (let month = 7; month <= 12; month++) {
        months.push({ year, month, label: `${MONTH_NAMES[month - 1]} ${year}`, fy: year + 1 });
      }
      // Jan-Jun of next calendar year
      for (let month = 1; month <= 6; month++) {
        months.push({ year: year + 1, month, label: `${MONTH_NAMES[month - 1]} ${year + 1}`, fy: year + 1 });
      }
    }
  } else {
    // Calendar year: January to December
    for (let year = startYear; year <= endYear; year++) {
      for (let month = 1; month <= 12; month++) {
        months.push({ year, month, label: `${MONTH_NAMES[month - 1]} ${year}`, fy: null });
      }
    }
  }
  return months;
}

// Helper to prepare YoY comparison data for charts with date range support
function prepareYoyComparisonDataForRange(userTrends, enrollmentTrends, certTrends, startYear, endYear, useFiscal) {
  const comparison = [];
  const months = generateMonthRange(startYear, endYear, useFiscal);
  
  // Limit to current date
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  
  const filteredMonths = months.filter(m => {
    if (m.year > currentYear) return false;
    if (m.year === currentYear && m.month > currentMonth) return false;
    return true;
  });
  
  for (const m of filteredMonths) {
    const monthKey = `${m.year}-${m.month.toString().padStart(2, '0')}`;
    const lastYearMonthKey = `${m.year - 1}-${m.month.toString().padStart(2, '0')}`;
    
    const currentUserData = userTrends.find(d => d.month === monthKey);
    const lastUserData = userTrends.find(d => d.month === lastYearMonthKey);
    const currentEnrollData = enrollmentTrends.find(d => d.month === monthKey);
    const lastEnrollData = enrollmentTrends.find(d => d.month === lastYearMonthKey);
    const currentCertData = certTrends.find(d => d.month === monthKey);
    const lastCertData = certTrends.find(d => d.month === lastYearMonthKey);
    
    const quarter = useFiscal ? FISCAL_QUARTER_MAP[m.month] : CALENDAR_QUARTER_MAP[m.month];
    const fyLabel = useFiscal ? ` (${getFiscalYearLabel(m.fy)})` : '';
    
    comparison.push({
      month: `${MONTH_NAMES[m.month - 1]} '${m.year.toString().slice(-2)}`,
      fullLabel: `${MONTH_NAMES[m.month - 1]} ${m.year}${fyLabel}`,
      quarter,
      fy: m.fy,
      year: m.year,
      monthNum: m.month,
      // User data
      users_current: currentUserData?.newUsers || 0,
      users_previous: lastUserData?.newUsers || 0,
      usersGrowth: currentUserData && lastUserData && lastUserData.newUsers > 0
        ? (((currentUserData.newUsers - lastUserData.newUsers) / lastUserData.newUsers) * 100).toFixed(1)
        : null,
      // Enrollments
      enrollments_current: currentEnrollData?.enrollments || 0,
      enrollments_previous: lastEnrollData?.enrollments || 0,
      completions_current: currentEnrollData?.completions || 0,
      completions_previous: lastEnrollData?.completions || 0,
      // Certifications
      certs_current: currentCertData?.certifications || 0,
      certs_previous: lastCertData?.certifications || 0,
      certsGrowth: currentCertData && lastCertData && lastCertData.certifications > 0
        ? (((currentCertData.certifications - lastCertData.certifications) / lastCertData.certifications) * 100).toFixed(1)
        : null,
      // NPCU
      npcu_current: currentCertData?.totalNpcu || 0,
      npcu_previous: lastCertData?.totalNpcu || 0,
      npcuGrowth: currentCertData && lastCertData && lastCertData.totalNpcu > 0
        ? (((currentCertData.totalNpcu - lastCertData.totalNpcu) / lastCertData.totalNpcu) * 100).toFixed(1)
        : null,
    });
  }
  
  return comparison;
}

// Calculate program metrics for a date range
function calculateProgramMetricsForRange(data, startYear, endYear, useFiscal) {
  if (!data || data.length === 0) return {};
  
  // Group by fiscal year or calendar year
  const yearGroups = {};
  for (const d of data) {
    const yearKey = useFiscal && d.fy ? d.fy : d.year;
    if (!yearGroups[yearKey]) {
      yearGroups[yearKey] = { users: 0, certs: 0, npcu: 0, completions: 0 };
    }
    yearGroups[yearKey].users += d.users_current || 0;
    yearGroups[yearKey].certs += d.certs_current || 0;
    yearGroups[yearKey].npcu += d.npcu_current || 0;
    yearGroups[yearKey].completions += d.completions_current || 0;
  }
  
  const years = Object.keys(yearGroups).sort();
  const currentYearKey = years[years.length - 1];
  const lastYearKey = years[years.length - 2];
  
  const current = yearGroups[currentYearKey] || {};
  const previous = yearGroups[lastYearKey] || {};
  
  return {
    currentYearLabel: useFiscal ? getFiscalYearLabel(parseInt(currentYearKey)) : currentYearKey,
    previousYearLabel: useFiscal ? getFiscalYearLabel(parseInt(lastYearKey)) : lastYearKey,
    usersGrowth: previous.users > 0 ? ((current.users - previous.users) / previous.users * 100).toFixed(1) : null,
    certsGrowth: previous.certs > 0 ? ((current.certs - previous.certs) / previous.certs * 100).toFixed(1) : null,
    npcuGrowth: previous.npcu > 0 ? ((current.npcu - previous.npcu) / previous.npcu * 100).toFixed(1) : null,
    totalUsersThisYear: current.users,
    totalCertsThisYear: current.certs,
    totalNpcuThisYear: current.npcu,
    totalUsersLastYear: previous.users,
    totalCertsLastYear: previous.certs,
    totalNpcuLastYear: previous.npcu
  };
}

// Info tooltip component
function InfoTooltip({ metricKey, size = 'small' }) {
  const metric = METRIC_DEFINITIONS[metricKey];
  if (!metric) return null;
  
  return (
    <Tooltip
      title={
        <Box sx={{ p: 1, maxWidth: 320 }}>
          <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
            {metric.title}
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {metric.description}
          </Typography>
          {metric.formula && (
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.1)', p: 1, borderRadius: 1, mb: 1 }}>
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                {metric.formula}
              </Typography>
            </Box>
          )}
          {metric.details && (
            <Box component="ul" sx={{ m: 0, pl: 2, '& li': { fontSize: '0.75rem' } }}>
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
      <IconButton size={size} sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}>
        <Info fontSize={size} />
      </IconButton>
    </Tooltip>
  );
}

// Trend indicator component
function TrendIndicator({ value, suffix = '%', showArrow = true }) {
  if (value === null || value === undefined) {
    return <span className="trend-na">—</span>;
  }
  
  const numValue = parseFloat(value);
  const isPositive = numValue > 0;
  const isZero = numValue === 0;
  
  return (
    <span className={`trend-indicator ${isPositive ? 'positive' : isZero ? 'neutral' : 'negative'}`}>
      {showArrow && (
        isPositive ? <ArrowUpward fontSize="small" /> :
        isZero ? <Remove fontSize="small" /> :
        <ArrowDownward fontSize="small" />
      )}
      {isPositive && '+'}{value}{suffix}
    </span>
  );
}

// KPI Card with MoM/YoY
function KpiCard({ title, icon, current, total, momChange, yoyChange, infoKey }) {
  return (
    <Card className="kpi-card">
      <CardContent>
        <Box className="kpi-header">
          <Box className="kpi-icon">{icon}</Box>
          <Typography variant="subtitle2" color="textSecondary">{title}</Typography>
          {infoKey && <InfoTooltip metricKey={infoKey} />}
        </Box>
        <Typography variant="h3" className="kpi-value">{current?.toLocaleString() || 0}</Typography>
        <Box className="kpi-changes">
          <Box className="kpi-change">
            <Typography variant="caption" color="textSecondary">vs Last Month</Typography>
            <TrendIndicator value={momChange} />
          </Box>
          <Box className="kpi-change">
            <Typography variant="caption" color="textSecondary">vs Last Year</Typography>
            <TrendIndicator value={yoyChange} />
          </Box>
        </Box>
        {total !== undefined && (
          <Typography variant="caption" color="textSecondary" className="kpi-total">
            Total: {total?.toLocaleString()}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// Active Filters Display
function ActiveFilters({ filters, onClearFilter, onClearAll }) {
  const filterLabels = {
    region: 'Region',
    owner: 'Account Owner',
    tier: 'Tier'
  };
  
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  
  if (activeFilters.length === 0) return null;
  
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
      <FilterList fontSize="small" color="action" />
      <Typography variant="body2" color="textSecondary" sx={{ mr: 1 }}>
        Active Filters:
      </Typography>
      {activeFilters.map(([key, value]) => (
        <Chip
          key={key}
          label={`${filterLabels[key] || key}: ${value}`}
          size="small"
          onDelete={() => onClearFilter(key)}
          color="primary"
          variant="outlined"
        />
      ))}
      <Chip
        label="Clear All"
        size="small"
        onClick={onClearAll}
        icon={<Clear />}
        color="default"
        variant="outlined"
        sx={{ ml: 1 }}
      />
    </Box>
  );
}

export default function AnalyticsDashboard() {
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false); // Loading state for tab-specific data
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [monthRange, setMonthRange] = useState(24);
  
  // Fiscal Year: July 1 - June 30 (Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun)
  const [useFiscalYear, setUseFiscalYear] = useState(true);
  const [dateRange, setDateRange] = useState([2024, 2026]); // [startYear, endYear]
  
  // Track which tabs have been loaded (for lazy loading)
  const [loadedTabs, setLoadedTabs] = useState(new Set([0])); // Tab 0 loads with initial
  
  // Filter states
  const [filterOptions, setFilterOptions] = useState({ tiers: [], regions: [], owners: [] });
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [selectedTier, setSelectedTier] = useState('');
  
  // Data states
  const [kpiSummary, setKpiSummary] = useState(null);
  const [ytdData, setYtdData] = useState(null);
  const [userTrends, setUserTrends] = useState([]);
  const [enrollmentTrends, setEnrollmentTrends] = useState([]);
  const [certificationTrends, setCertificationTrends] = useState([]);
  const [complianceData, setComplianceData] = useState([]);
  const [weeklySummary, setWeeklySummary] = useState([]);
  
  // Deep Analytics states
  const [engagementScores, setEngagementScores] = useState([]);
  const [tierProgression, setTierProgression] = useState(null);
  const [userSegments, setUserSegments] = useState([]);
  const [regionalComparison, setRegionalComparison] = useState([]);
  const [ownerPerformance, setOwnerPerformance] = useState([]);

  // Build query string from filters
  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (selectedRegion) params.append('region', selectedRegion);
    if (selectedOwner) params.append('owner', selectedOwner);
    if (selectedTier) params.append('tier', selectedTier);
    return params.toString();
  }, [selectedRegion, selectedOwner, selectedTier]);

  // Load filter options
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const response = await fetch(`${API_BASE}/reports/filters`);
        if (response.ok) {
          const data = await response.json();
          setFilterOptions(data);
        }
      } catch (err) {
        console.error('Failed to load filters:', err);
      }
    };
    loadFilters();
  }, []);

  // LAZY LOADING: Load only essential data on initial mount
  // Tab-specific data is loaded when tabs are clicked
  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const filterParams = buildFilterParams();
    const filterSuffix = filterParams ? `&${filterParams}` : '';
    
    try {
      // INITIAL LOAD: Only KPI, YTD, and Tab 0 data (Monthly Trends)
      const [kpi, ytd, users, enrollments, certs] = await Promise.all([
        fetch(`${API_BASE}/trends/kpi-summary?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/ytd?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/users?months=${monthRange}${filterSuffix}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/enrollments?months=${monthRange}${filterSuffix}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/certifications?months=${monthRange}${filterSuffix}`).then(r => r.json()),
      ]);
      
      setKpiSummary(kpi);
      setYtdData(ytd);
      setUserTrends(users);
      setEnrollmentTrends(enrollments);
      setCertificationTrends(certs);
      setLoadedTabs(new Set([0])); // Mark tab 0 as loaded
    } catch (err) {
      console.error('Failed to fetch initial analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [monthRange, buildFilterParams]);

  // LAZY LOADING: Load data for a specific tab
  const loadTabData = useCallback(async (tabIndex) => {
    if (loadedTabs.has(tabIndex)) return; // Already loaded
    
    // Tab 0 (Program Success) and Tab 1 (Monthly Trends) use data loaded initially
    if (tabIndex === 0 || tabIndex === 1) {
      setLoadedTabs(prev => new Set([...prev, tabIndex]));
      return;
    }
    
    setTabLoading(true);
    const filterParams = buildFilterParams();
    const filterSuffix = filterParams ? `&${filterParams}` : '';
    
    try {
      switch (tabIndex) {
        case 2: { // Weekly Activity
          const weekly = await fetch(`${API_BASE}/trends/weekly?weeks=12${filterSuffix}`).then(r => r.json());
          setWeeklySummary(weekly);
          break;
        }
        case 3: { // Compliance
          const compliance = await fetch(`${API_BASE}/trends/compliance?${filterParams}`).then(r => r.json());
          setComplianceData(compliance);
          break;
        }
        case 4: { // Partner Engagement (expensive!)
          const engagement = await fetch(`${API_BASE}/analytics/engagement-scores?limit=25${filterSuffix}`).then(r => r.json());
          setEngagementScores(engagement?.data || []);
          break;
        }
        case 5: { // Tier Progression
          const tierProg = await fetch(`${API_BASE}/analytics/tier-progression?${filterParams}`).then(r => r.json());
          setTierProgression(tierProg?.data || null);
          break;
        }
        case 6: { // User Segments
          const segments = await fetch(`${API_BASE}/analytics/user-segments?${filterParams}`).then(r => r.json());
          setUserSegments(segments?.data || []);
          break;
        }
        case 7: { // Regional
          const regional = await fetch(`${API_BASE}/analytics/regional-comparison?${filterParams}`).then(r => r.json());
          setRegionalComparison(regional?.data || []);
          break;
        }
        case 8: { // Owner Performance
          const owners = await fetch(`${API_BASE}/analytics/owner-performance?${filterParams}`).then(r => r.json());
          setOwnerPerformance(owners?.data || []);
          break;
        }
        default:
          break;
      }
      setLoadedTabs(prev => new Set([...prev, tabIndex]));
    } catch (err) {
      console.error(`Failed to load tab ${tabIndex} data:`, err);
    } finally {
      setTabLoading(false);
    }
  }, [buildFilterParams, loadedTabs]);

  // Handle tab change with lazy loading
  const handleTabChange = useCallback((event, newValue) => {
    setActiveTab(newValue);
    loadTabData(newValue);
  }, [loadTabData]);

  // Full refresh - reload all data for current tab and clear cache
  const fetchData = useCallback(async () => {
    setLoadedTabs(new Set()); // Reset loaded tabs
    await fetchInitialData();
    if (activeTab !== 0) {
      await loadTabData(activeTab);
    }
  }, [fetchInitialData, loadTabData, activeTab]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Export report with filters
  const handleExport = async () => {
    try {
      const filterParams = buildFilterParams();
      const filterSuffix = filterParams ? `&${filterParams}` : '';
      const report = await fetch(`${API_BASE}/trends/full-report?months=${monthRange}${filterSuffix}`).then(r => r.json());
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  // Clear individual filter
  const handleClearFilter = (filterName) => {
    switch (filterName) {
      case 'region': setSelectedRegion(''); break;
      case 'owner': setSelectedOwner(''); break;
      case 'tier': setSelectedTier(''); break;
    }
  };

  // Clear all filters
  const handleClearAllFilters = () => {
    setSelectedRegion('');
    setSelectedOwner('');
    setSelectedTier('');
  };

  // Get active filters object
  const activeFilters = {
    region: selectedRegion,
    owner: selectedOwner,
    tier: selectedTier
  };

  if (loading) {
    return (
      <PageContent>
        <Box className="loading-state">
          <CircularProgress />
          <Typography>Loading analytics...</Typography>
        </Box>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <div className="analytics-dashboard">
        <PageHeader
          icon={<Timeline />}
          title="Analytics Dashboard"
          subtitle="Track KPIs with month-over-month and year-over-year trends"
          actions={
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel id="period-label">Period</InputLabel>
                <Select
                  labelId="period-label"
                  value={monthRange}
                  label="Period"
                  onChange={(e) => setMonthRange(e.target.value)}
                >
                  <MenuItem value={6}>6 Months</MenuItem>
                  <MenuItem value={12}>12 Months</MenuItem>
                  <MenuItem value={24}>24 Months</MenuItem>
                </Select>
              </FormControl>
              <ActionButton
                startIcon={<Download />}
                onClick={handleExport}
                variant="outlined"
              >
                Export
              </ActionButton>
              <ActionButton
                startIcon={<Refresh />}
                onClick={fetchData}
                variant="outlined"
              >
                Refresh
              </ActionButton>
            </Box>
          }
        />

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Filter Controls */}
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FilterList color="primary" />
            <Typography variant="h6">Filters</Typography>
            <Typography variant="body2" color="textSecondary" sx={{ ml: 2 }}>
              Stack multiple filters to narrow your analysis
            </Typography>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="region-label">Region</InputLabel>
                <Select
                  labelId="region-label"
                  value={selectedRegion}
                  label="Region"
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  sx={{ bgcolor: 'var(--admin-bg-input, #fff)' }}
                >
                  <MenuItem value="">All Regions</MenuItem>
                  {filterOptions.regions.map(region => (
                    <MenuItem key={region} value={region}>{region}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="owner-label">Account Owner</InputLabel>
                <Select
                  labelId="owner-label"
                  value={selectedOwner}
                  label="Account Owner"
                  onChange={(e) => setSelectedOwner(e.target.value)}
                  sx={{ bgcolor: 'var(--admin-bg-input, #fff)' }}
                >
                  <MenuItem value="">All Owners</MenuItem>
                  {filterOptions.owners.map(owner => (
                    <MenuItem key={owner} value={owner}>{owner}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small" sx={{ minWidth: 150 }}>
                <InputLabel id="tier-label">Tier</InputLabel>
                <Select
                  labelId="tier-label"
                  value={selectedTier}
                  label="Tier"
                  onChange={(e) => setSelectedTier(e.target.value)}
                  sx={{ bgcolor: 'var(--admin-bg-input, #fff)' }}
                >
                  <MenuItem value="">All Tiers</MenuItem>
                  {filterOptions.tiers.map(tier => (
                    <MenuItem key={tier} value={tier}>{tier}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Paper>

        {/* Active Filters Display */}
        <ActiveFilters 
          filters={activeFilters} 
          onClearFilter={handleClearFilter}
          onClearAll={handleClearAllFilters}
        />

        {/* KPI Summary Cards */}
        {kpiSummary && (
          <Box sx={{ mb: 4 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              This Month: {kpiSummary.period?.current}
              {(selectedRegion || selectedOwner || selectedTier) && (
                <Chip 
                  size="small" 
                  label="Filtered" 
                  color="info" 
                  sx={{ ml: 2 }}
                />
              )}
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <KpiCard
                  title="New Users"
                  icon={<People color="primary" />}
                  current={kpiSummary.users?.thisMonth}
                  previous={kpiSummary.users?.lastMonth}
                  lastYear={kpiSummary.users?.lastYear}
                  total={kpiSummary.users?.total}
                  momChange={kpiSummary.users?.momChange}
                  yoyChange={kpiSummary.users?.yoyChange}
                  infoKey="momChange"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <KpiCard
                  title="Enrollments"
                  icon={<School color="info" />}
                  current={kpiSummary.enrollments?.thisMonth}
                  previous={kpiSummary.enrollments?.lastMonth}
                  lastYear={kpiSummary.enrollments?.lastYear}
                  total={kpiSummary.enrollments?.total}
                  momChange={kpiSummary.enrollments?.momChange}
                  yoyChange={kpiSummary.enrollments?.yoyChange}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <KpiCard
                  title="Completions"
                  icon={<EmojiEvents color="success" />}
                  current={kpiSummary.completions?.thisMonth}
                  previous={kpiSummary.completions?.lastMonth}
                  lastYear={kpiSummary.completions?.lastYear}
                  total={kpiSummary.completions?.total}
                  momChange={kpiSummary.completions?.momChange}
                  yoyChange={kpiSummary.completions?.yoyChange}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <KpiCard
                  title="NPCU Earned"
                  icon={<Assessment color="warning" />}
                  current={kpiSummary.npcu?.thisMonth}
                  previous={kpiSummary.npcu?.lastMonth}
                  lastYear={kpiSummary.npcu?.lastYear}
                  total={kpiSummary.npcu?.total}
                  momChange={kpiSummary.npcu?.momChange}
                  yoyChange={kpiSummary.npcu?.yoyChange}
                  infoKey="npcu"
                />
              </Grid>
            </Grid>
          </Box>
        )}

        {/* YTD Comparison */}
        {ytdData && (
          <Paper sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Year-to-Date Comparison ({ytdData.currentYear} vs {ytdData.lastYear})
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={6} md={3}>
                <Box className="ytd-stat">
                  <Typography variant="subtitle2">New Users</Typography>
                  <Box className="ytd-values">
                    <span className="ytd-current">{ytdData.users?.thisYear?.toLocaleString()}</span>
                    <span className="ytd-vs">vs</span>
                    <span className="ytd-previous">{ytdData.users?.lastYear?.toLocaleString()}</span>
                  </Box>
                  <TrendIndicator value={ytdData.users?.change} />
                </Box>
              </Grid>
              <Grid item xs={6} md={3}>
                <Box className="ytd-stat">
                  <Typography variant="subtitle2">Enrollments</Typography>
                  <Box className="ytd-values">
                    <span className="ytd-current">{ytdData.enrollments?.thisYear?.toLocaleString()}</span>
                    <span className="ytd-vs">vs</span>
                    <span className="ytd-previous">{ytdData.enrollments?.lastYear?.toLocaleString()}</span>
                  </Box>
                  <TrendIndicator value={ytdData.enrollments?.change} />
                </Box>
              </Grid>
              <Grid item xs={6} md={3}>
                <Box className="ytd-stat">
                  <Typography variant="subtitle2">Completions</Typography>
                  <Box className="ytd-values">
                    <span className="ytd-current">{ytdData.completions?.thisYear?.toLocaleString()}</span>
                    <span className="ytd-vs">vs</span>
                    <span className="ytd-previous">{ytdData.completions?.lastYear?.toLocaleString()}</span>
                  </Box>
                  <TrendIndicator value={ytdData.completions?.change} />
                </Box>
              </Grid>
              <Grid item xs={6} md={3}>
                <Box className="ytd-stat">
                  <Typography variant="subtitle2">NPCU Earned</Typography>
                  <Box className="ytd-values">
                    <span className="ytd-current">{ytdData.npcu?.thisYear?.toLocaleString()}</span>
                    <span className="ytd-vs">vs</span>
                    <span className="ytd-previous">{ytdData.npcu?.lastYear?.toLocaleString()}</span>
                  </Box>
                  <TrendIndicator value={ytdData.npcu?.change} />
                </Box>
              </Grid>
            </Grid>
          </Paper>
        )}

        {/* Tabs for detailed trends */}
        <Paper sx={{ mb: 4 }}>
          <Tabs 
            value={activeTab} 
            onChange={handleTabChange}
            sx={{ borderBottom: 1, borderColor: 'divider' }}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Rocket fontSize="small" sx={{ color: '#FF6B35' }} />Program Success<InfoButton tooltip="Visual charts showing partner enablement program success with year-over-year comparisons." /></Box>} icon={<Timeline />} iconPosition="start" sx={{ fontWeight: 'bold' }} />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Monthly Trends<InfoButton tooltip="Month-by-month breakdown of users, enrollments, completions, and certifications. Includes MoM (month-over-month) changes." /></Box>} icon={<CalendarMonth />} iconPosition="start" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Weekly Activity<InfoButton tooltip="Week-by-week activity breakdown showing enrollments, completions, and certifications. Good for spotting recent trends." /></Box>} icon={<BarChart />} iconPosition="start" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Compliance<InfoButton tooltip="Partner compliance status by tier. Shows which partners meet their tier requirements and identifies gaps." /></Box>} icon={<Assessment />} iconPosition="start" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Partner Engagement<InfoButton tooltip="Engagement scores and metrics by partner. Higher scores indicate active learning and certification progress." /></Box>} icon={<Speed />} iconPosition="start" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Tier Progression<InfoButton tooltip="Partners approaching tier upgrades or at risk of downgrade. Based on NPCU credits vs tier requirements." /></Box>} icon={<Rocket />} iconPosition="start" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>User Segments<InfoButton tooltip="LMS users segmented by activity level: Active (30 days), Recent (90 days), Lapsed, Dormant, and Never Active." /></Box>} icon={<Groups />} iconPosition="start" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Regional<InfoButton tooltip="Performance comparison across geographic regions. Shows users, completion rates, and certifications by region." /></Box>} icon={<Map />} iconPosition="start" />
            <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Owner Performance<InfoButton tooltip="Account owner portfolio metrics. Shows partner counts, activation rates, and LMS adoption by owner." /></Box>} icon={<Person />} iconPosition="start" />
          </Tabs>
          
          {/* Tab loading indicator */}
          {tabLoading && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <CircularProgress size={24} />
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                Loading tab data...
              </Typography>
            </Box>
          )}

          {/* Program Success - Visual Charts */}
          {activeTab === 0 && (() => {
            // Use new date range functions with fiscal year support
            const yoyData = prepareYoyComparisonDataForRange(userTrends, enrollmentTrends, certificationTrends, dateRange[0], dateRange[1], useFiscalYear);
            const metrics = calculateProgramMetricsForRange(yoyData, dateRange[0], dateRange[1], useFiscalYear);
            
            // Generate year marks for slider
            const currentCalYear = new Date().getFullYear();
            const minYear = 2022;
            const maxYear = currentCalYear + 1;
            const yearMarks = [];
            for (let y = minYear; y <= maxYear; y++) {
              yearMarks.push({ value: y, label: useFiscalYear ? `FY${(y + 1).toString().slice(-2)}` : y.toString() });
            }
            
            return (
              <Box sx={{ p: 3 }}>
                {/* Program Success Header with Date Controls */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ textAlign: 'center', mb: 3 }}>
                    <Typography variant="h5" fontWeight="bold" gutterBottom sx={{ color: CHART_COLORS.primary }}>
                      Partner Enablement Program Success
                    </Typography>
                    <Typography variant="body1" color="textSecondary">
                      {useFiscalYear 
                        ? `Fiscal Year Comparison: ${getFiscalYearLabel(dateRange[0] + 1)} – ${getFiscalYearLabel(dateRange[1])} (July–June)`
                        : `Calendar Year Comparison: ${dateRange[0]} – ${dateRange[1]}`}
                    </Typography>
                  </Box>
                  
                  {/* Date Range Controls */}
                  <Paper sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }} variant="outlined">
                    <Grid container spacing={3} alignItems="center">
                      {/* Fiscal Year Toggle */}
                      <Grid item xs={12} md={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <EventAvailable color={useFiscalYear ? 'primary' : 'action'} />
                          <FormControlLabel
                            control={
                              <Switch
                                checked={useFiscalYear}
                                onChange={(e) => setUseFiscalYear(e.target.checked)}
                                color="primary"
                              />
                            }
                            label={
                              <Box>
                                <Typography variant="body2" fontWeight="medium">
                                  Fiscal Year Mode
                                </Typography>
                                <Typography variant="caption" color="textSecondary">
                                  {useFiscalYear ? 'July 1 – June 30' : 'January – December'}
                                </Typography>
                              </Box>
                            }
                          />
                        </Box>
                      </Grid>
                      
                      {/* Date Range Slider */}
                      <Grid item xs={12} md={6}>
                        <Box sx={{ px: 2 }}>
                          <Typography variant="body2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DateRange fontSize="small" />
                            Date Range: {useFiscalYear 
                              ? `${getFiscalYearLabel(dateRange[0] + 1)} to ${getFiscalYearLabel(dateRange[1])}`
                              : `${dateRange[0]} to ${dateRange[1]}`}
                          </Typography>
                          <Slider
                            value={dateRange}
                            onChange={(e, newValue) => setDateRange(newValue)}
                            min={minYear}
                            max={maxYear}
                            step={1}
                            marks={yearMarks}
                            valueLabelDisplay="auto"
                            valueLabelFormat={(v) => useFiscalYear ? `FY${(v + 1).toString().slice(-2)}` : v}
                            sx={{ 
                              color: CHART_COLORS.primary,
                              '& .MuiSlider-markLabel': { fontSize: '0.7rem' }
                            }}
                          />
                        </Box>
                      </Grid>
                      
                      {/* Fiscal Quarter Legend */}
                      <Grid item xs={12} md={3}>
                        {useFiscalYear && (
                          <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            <Typography variant="caption" fontWeight="bold" display="block" gutterBottom>
                              Fiscal Quarters:
                            </Typography>
                            <Box component="span" sx={{ display: 'block' }}>Q1: Jul–Sep</Box>
                            <Box component="span" sx={{ display: 'block' }}>Q2: Oct–Dec</Box>
                            <Box component="span" sx={{ display: 'block' }}>Q3: Jan–Mar</Box>
                            <Box component="span" sx={{ display: 'block' }}>Q4: Apr–Jun</Box>
                          </Box>
                        )}
                      </Grid>
                    </Grid>
                  </Paper>
                </Box>

                {/* Key Growth Metrics */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', bgcolor: metrics.usersGrowth > 0 ? 'success.light' : 'warning.light', p: 2 }}>
                      <Typography variant="h3" fontWeight="bold" color={metrics.usersGrowth > 0 ? 'success.dark' : 'warning.dark'}>
                        {metrics.usersGrowth > 0 ? '+' : ''}{metrics.usersGrowth || 0}%
                      </Typography>
                      <Typography variant="subtitle1">User Registrations YoY</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {metrics.totalUsersThisYear?.toLocaleString()} users YTD
                      </Typography>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', bgcolor: metrics.certsGrowth > 0 ? 'success.light' : 'warning.light', p: 2 }}>
                      <Typography variant="h3" fontWeight="bold" color={metrics.certsGrowth > 0 ? 'success.dark' : 'warning.dark'}>
                        {metrics.certsGrowth > 0 ? '+' : ''}{metrics.certsGrowth || 0}%
                      </Typography>
                      <Typography variant="subtitle1">Certifications YoY</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {metrics.totalCertsThisYear?.toLocaleString()} certifications YTD
                      </Typography>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ textAlign: 'center', bgcolor: metrics.npcuGrowth > 0 ? 'success.light' : 'warning.light', p: 2 }}>
                      <Typography variant="h3" fontWeight="bold" color={metrics.npcuGrowth > 0 ? 'success.dark' : 'warning.dark'}>
                        {metrics.npcuGrowth > 0 ? '+' : ''}{metrics.npcuGrowth || 0}%
                      </Typography>
                      <Typography variant="subtitle1">NPCU Earned YoY</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {metrics.totalNpcuThisYear?.toLocaleString()} NPCU YTD
                      </Typography>
                    </Card>
                  </Grid>
                </Grid>

                {/* Certifications YoY Chart */}
                <Paper sx={{ p: 3, mb: 4 }} variant="outlined">
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EmojiEvents color="warning" /> Certifications: {metrics.currentYearLabel || 'Current'} vs {metrics.previousYearLabel || 'Previous'}
                  </Typography>
                  <Box sx={{ width: '100%', height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={yoyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} domain={[-100, 200]} />
                        <RechartsTooltip content={<CustomChartTooltip />} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="certs_current" fill={CHART_COLORS.thisYear} name={`${metrics.currentYearLabel || 'Current'} Certifications`} />
                        <Bar yAxisId="left" dataKey="certs_previous" fill={CHART_COLORS.lastYear} name={`${metrics.previousYearLabel || 'Previous'} Certifications`} opacity={0.6} />
                        <Line yAxisId="right" type="monotone" dataKey="certsGrowth" stroke={CHART_COLORS.success} strokeWidth={2} dot={{ r: 4 }} name="YoY Growth %" />
                        <ReferenceLine yAxisId="right" y={0} stroke="#999" strokeDasharray="3 3" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>

                {/* NPCU Earned Trend */}
                <Paper sx={{ p: 3, mb: 4 }} variant="outlined">
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Assessment color="primary" /> NPCU Earned: {metrics.currentYearLabel || 'Current'} vs {metrics.previousYearLabel || 'Previous'}
                  </Typography>
                  <Box sx={{ width: '100%', height: 350 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={yoyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <RechartsTooltip content={<CustomChartTooltip />} />
                        <Legend />
                        <Area type="monotone" dataKey="npcu_current" fill={CHART_COLORS.thisYear} stroke={CHART_COLORS.thisYear} fillOpacity={0.3} name={`${metrics.currentYearLabel || 'Current'} NPCU`} />
                        <Area type="monotone" dataKey="npcu_previous" fill={CHART_COLORS.lastYear} stroke={CHART_COLORS.lastYear} fillOpacity={0.2} name={`${metrics.previousYearLabel || 'Previous'} NPCU`} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>

                {/* User Registrations Trend */}
                <Paper sx={{ p: 3, mb: 4 }} variant="outlined">
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <People color="info" /> New User Registrations: {metrics.currentYearLabel || 'Current'} vs {metrics.previousYearLabel || 'Previous'}
                  </Typography>
                  <Box sx={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={yoyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <RechartsTooltip content={<CustomChartTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="users_current" stroke={CHART_COLORS.thisYear} strokeWidth={3} dot={{ r: 5 }} name={`${metrics.currentYearLabel || 'Current'} Users`} />
                        <Line type="monotone" dataKey="users_previous" stroke={CHART_COLORS.lastYear} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} name={`${metrics.previousYearLabel || 'Previous'} Users`} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>

                {/* Completions Trend */}
                <Paper sx={{ p: 3 }} variant="outlined">
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <School color="success" /> Course Completions: {metrics.currentYearLabel || 'Current'} vs {metrics.previousYearLabel || 'Previous'}
                  </Typography>
                  <Box sx={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={yoyData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <RechartsTooltip content={<CustomChartTooltip />} />
                        <Legend />
                        <Bar dataKey="completions_current" fill={CHART_COLORS.success} name={`${metrics.currentYearLabel || 'Current'} Completions`} />
                        <Bar dataKey="completions_previous" fill={CHART_COLORS.completions} name={`${metrics.previousYearLabel || 'Previous'} Completions`} opacity={0.5} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Box>
            );
          })()}

          {/* Monthly Trends Table */}
          {activeTab === 1 && (
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Month</TableCell>
                    <TableCell align="right">New Users</TableCell>
                    <TableCell align="right">MoM</TableCell>
                    <TableCell align="right">Enrollments</TableCell>
                    <TableCell align="right">Completions</TableCell>
                    <TableCell align="right">Rate</TableCell>
                    <TableCell align="right">Certifications</TableCell>
                    <TableCell align="right">NPCU</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {userTrends.slice().reverse().map((row) => {
                    const enrollment = enrollmentTrends.find(e => e.month === row.month) || {};
                    const cert = certificationTrends.find(c => c.month === row.month) || {};
                    return (
                      <TableRow key={row.month} hover>
                        <TableCell>
                          <strong>{row.month}</strong>
                        </TableCell>
                        <TableCell align="right">{row.newUsers?.toLocaleString()}</TableCell>
                        <TableCell align="right">
                          <TrendIndicator value={row.momChangePercent} showArrow={false} />
                        </TableCell>
                        <TableCell align="right">{enrollment.enrollments?.toLocaleString() || '—'}</TableCell>
                        <TableCell align="right">{enrollment.completions?.toLocaleString() || '—'}</TableCell>
                        <TableCell align="right">{enrollment.completionRate || '—'}%</TableCell>
                        <TableCell align="right">{cert.certifications?.toLocaleString() || '—'}</TableCell>
                        <TableCell align="right">{cert.totalNpcu?.toLocaleString() || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Weekly Activity */}
          {activeTab === 2 && (
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Week</TableCell>
                    <TableCell align="right">Completions</TableCell>
                    <TableCell align="right">Unique Users</TableCell>
                    <TableCell align="right">Certifications</TableCell>
                    <TableCell align="right">NPCU Earned</TableCell>
                    <TableCell align="right">Avg/Day</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {weeklySummary.map((week) => (
                    <TableRow key={week.year_week} hover>
                      <TableCell>
                        <Box>
                          <strong>{week.week_start}</strong>
                          <Typography variant="caption" display="block" color="textSecondary">
                            to {week.week_end}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{week.completions?.toLocaleString()}</TableCell>
                      <TableCell align="right">{week.unique_users?.toLocaleString()}</TableCell>
                      <TableCell align="right">{week.certifications?.toLocaleString()}</TableCell>
                      <TableCell align="right">{week.npcu_earned?.toLocaleString()}</TableCell>
                      <TableCell align="right">{(week.completions / 7).toFixed(1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Compliance by Tier */}
          {activeTab === 3 && (
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6">Tier Compliance Summary</Typography>
                <InfoTooltip metricKey="complianceRate" />
              </Box>
              <Grid container spacing={3}>
                {complianceData.map((tier) => (
                  <Grid item xs={12} sm={6} md={4} key={tier.tier}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom>{tier.tier}</Typography>
                        <Box sx={{ mb: 2 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="body2" color="textSecondary">
                              Compliance Rate
                            </Typography>
                            <Typography variant="body2" fontWeight="bold">
                              {tier.complianceRate}%
                            </Typography>
                          </Box>
                          <LinearProgress 
                            variant="determinate" 
                            value={parseFloat(tier.complianceRate)} 
                            color={parseFloat(tier.complianceRate) >= 70 ? 'success' : 
                                   parseFloat(tier.complianceRate) >= 50 ? 'warning' : 'error'}
                            sx={{ height: 10, borderRadius: 5 }}
                          />
                        </Box>
                        <Grid container spacing={1}>
                          <Grid item xs={6}>
                            <Typography variant="caption" color="textSecondary">Total Partners</Typography>
                            <Typography variant="h6">{tier.totalPartners}</Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="caption" color="textSecondary">Compliant</Typography>
                            <Typography variant="h6" color="success.main">{tier.compliantPartners}</Typography>
                          </Grid>
                          <Grid item xs={12}>
                            <Typography variant="caption" color="error.main">
                              {tier.nonCompliantPartners} partners need attention
                            </Typography>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* Partner Engagement */}
          {activeTab === 4 && (
            <Box sx={{ p: 3 }}>
              <Grid container spacing={3}>
                {/* Top Engaged Partners */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Star color="warning" /> Top Engaged Partners
                    <InfoTooltip metricKey="engagementScore" />
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Partner</TableCell>
                          <TableCell align="center">
                            Score
                            <InfoTooltip metricKey="engagementScore" />
                          </TableCell>
                          <TableCell align="center">
                            Activation
                            <InfoTooltip metricKey="activationRate" />
                          </TableCell>
                          <TableCell align="center">
                            Completion
                            <InfoTooltip metricKey="completionRate" />
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {engagementScores.slice(0, 10).map((partner, idx) => (
                          <TableRow key={partner.partner_id} sx={{ bgcolor: idx < 3 ? 'success.light' : 'inherit' }}>
                            <TableCell>
                              <Typography variant="body2" fontWeight={idx < 3 ? 'bold' : 'normal'}>
                                {idx + 1}. {partner.account_name}
                              </Typography>
                              <Typography variant="caption" color="textSecondary">{partner.tier}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={`${partner.engagement_score}/100`} 
                                size="small" 
                                color={partner.engagement_score >= 70 ? 'success' : partner.engagement_score >= 40 ? 'warning' : 'default'}
                              />
                            </TableCell>
                            <TableCell align="center">{partner.activation_rate}%</TableCell>
                            <TableCell align="center">{partner.completion_rate}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>

                {/* Lowest Engaged Partners */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning color="error" /> Needs Attention
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Partner</TableCell>
                          <TableCell align="center">
                            Score
                            <InfoTooltip metricKey="engagementScore" />
                          </TableCell>
                          <TableCell align="center">Users</TableCell>
                          <TableCell align="center">Completions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {engagementScores.slice(-10).reverse().map((partner) => (
                          <TableRow key={partner.partner_id}>
                            <TableCell>
                              <Typography variant="body2">{partner.account_name}</Typography>
                              <Typography variant="caption" color="textSecondary">{partner.tier}</Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={`${partner.engagement_score}/100`} 
                                size="small" 
                                color="error"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">{partner.total_users}</TableCell>
                            <TableCell align="center">{partner.completions}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* Tier Progression */}
          {activeTab === 5 && (
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6">Partner Tier Progression</Typography>
                <InfoTooltip metricKey="tierProgression" />
              </Box>
              <Grid container spacing={3}>
                {/* Close to Upgrade */}
                <Grid item xs={12} md={6}>
                  <Card variant="outlined" sx={{ borderColor: 'success.main' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircle color="success" /> Close to Upgrade ({tierProgression?.closeToUpgrade?.length || 0})
                      </Typography>
                      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                        Partners within 80% of next tier threshold
                      </Typography>
                      <TableContainer sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Partner</TableCell>
                              <TableCell>Current Tier</TableCell>
                              <TableCell align="right">
                                NPCU
                                <InfoTooltip metricKey="npcu" />
                              </TableCell>
                              <TableCell align="right">To Upgrade</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tierProgression?.closeToUpgrade?.map((partner) => (
                              <TableRow key={partner.partner_id}>
                                <TableCell>{partner.account_name}</TableCell>
                                <TableCell>
                                  <Chip label={partner.current_tier} size="small" />
                                </TableCell>
                                <TableCell align="right">{partner.current_npcu}</TableCell>
                                <TableCell align="right">
                                  <Typography color="success.main" fontWeight="bold">
                                    +{partner.npcu_needed}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>

                {/* At Risk */}
                <Grid item xs={12} md={6}>
                  <Card variant="outlined" sx={{ borderColor: 'error.main' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Warning color="error" /> At Risk ({tierProgression?.atRiskPartners?.length || 0})
                      </Typography>
                      <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                        Partners below minimum threshold for their tier
                      </Typography>
                      <TableContainer sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Partner</TableCell>
                              <TableCell>Tier</TableCell>
                              <TableCell align="right">
                                NPCU
                                <InfoTooltip metricKey="npcu" />
                              </TableCell>
                              <TableCell align="right">Required</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tierProgression?.atRiskPartners?.map((partner) => (
                              <TableRow key={partner.partner_id}>
                                <TableCell>{partner.account_name}</TableCell>
                                <TableCell>
                                  <Chip label={partner.tier} size="small" color="error" />
                                </TableCell>
                                <TableCell align="right">{partner.current_npcu}</TableCell>
                                <TableCell align="right">
                                  <Typography color="error.main">
                                    {partner.required_npcu}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          )}

          {/* User Segments */}
          {activeTab === 6 && (
            <Box sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6">User Activity Segments</Typography>
                <InfoTooltip metricKey="userSegments" />
              </Box>
              <Grid container spacing={3}>
                {userSegments.map((segment) => {
                  const segmentColors = {
                    'Active': 'success',
                    'Recent': 'info',
                    'Lapsed': 'warning',
                    'Dormant': 'error',
                    'Never Active': 'default'
                  };
                  const segmentIcons = {
                    'Active': <CheckCircle />,
                    'Recent': <Speed />,
                    'Lapsed': <Warning />,
                    'Dormant': <Groups />,
                    'Never Active': <Person />
                  };
                  return (
                    <Grid item xs={12} sm={6} md={2.4} key={segment.segment}>
                      <Card variant="outlined">
                        <CardContent sx={{ textAlign: 'center' }}>
                          <Box sx={{ color: `${segmentColors[segment.segment]}.main`, mb: 1 }}>
                            {segmentIcons[segment.segment]}
                          </Box>
                          <Typography variant="h4" fontWeight="bold">
                            {segment.user_count?.toLocaleString()}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            {segment.segment}
                          </Typography>
                          <Typography variant="h6" color={`${segmentColors[segment.segment]}.main`}>
                            {segment.percentage}%
                          </Typography>
                          <LinearProgress 
                            variant="determinate" 
                            value={parseFloat(segment.percentage)} 
                            color={segmentColors[segment.segment]}
                            sx={{ mt: 1, height: 8, borderRadius: 4 }}
                          />
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
              <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>Segment Definitions:</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Typography variant="caption"><strong>Active:</strong> Activity in last 30 days</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Typography variant="caption"><strong>Recent:</strong> Activity 31-90 days ago</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Typography variant="caption"><strong>Lapsed:</strong> Activity 91-180 days ago</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Typography variant="caption"><strong>Dormant:</strong> No activity 180+ days</Typography>
                  </Grid>
                  <Grid item xs={12} sm={6} md={2.4}>
                    <Typography variant="caption"><strong>Never Active:</strong> Registered, no enrollments</Typography>
                  </Grid>
                </Grid>
              </Box>
            </Box>
          )}

          {/* Regional Comparison */}
          {activeTab === 7 && (
            <Box sx={{ p: 3 }}>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Region</TableCell>
                      <TableCell align="center">Partners</TableCell>
                      <TableCell align="center">Users</TableCell>
                      <TableCell align="center">Avg NPCU</TableCell>
                      <TableCell align="center">Completions</TableCell>
                      <TableCell align="center">Completion Rate</TableCell>
                      <TableCell align="center">Compliance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {regionalComparison.map((region) => (
                      <TableRow key={region.region || 'Unknown'}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Map color="primary" fontSize="small" />
                            <Typography fontWeight="bold">{region.region || 'Unknown'}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">{region.partner_count?.toLocaleString()}</TableCell>
                        <TableCell align="center">{region.total_users?.toLocaleString()}</TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={region.avg_npcu || 0} 
                            size="small"
                            color={region.avg_npcu >= 15 ? 'success' : region.avg_npcu >= 8 ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="center">{region.total_completions?.toLocaleString()}</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LinearProgress 
                              variant="determinate" 
                              value={parseFloat(region.completion_rate) || 0} 
                              sx={{ flex: 1, height: 8, borderRadius: 4 }}
                              color={region.completion_rate >= 50 ? 'success' : 'warning'}
                            />
                            <Typography variant="body2">{region.completion_rate}%</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={`${region.compliance_rate || 0}%`}
                            size="small"
                            color={region.compliance_rate >= 70 ? 'success' : region.compliance_rate >= 50 ? 'warning' : 'error'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}

          {/* Owner Performance */}
          {activeTab === 8 && (
            <Box sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Person color="primary" /> Partner Account Manager Performance
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Account Owner</TableCell>
                      <TableCell align="center">Partners</TableCell>
                      <TableCell align="center">Total Users</TableCell>
                      <TableCell align="center">Active Users</TableCell>
                      <TableCell align="center">Avg NPCU</TableCell>
                      <TableCell align="center">Total NPCU</TableCell>
                      <TableCell align="center">Compliance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ownerPerformance.map((owner, idx) => (
                      <TableRow key={owner.account_owner} sx={{ bgcolor: idx < 3 ? 'success.light' : 'inherit' }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {idx < 3 && <Star color="warning" fontSize="small" />}
                            <Typography fontWeight={idx < 3 ? 'bold' : 'normal'}>
                              {owner.account_owner || 'Unassigned'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="center">{owner.partner_count}</TableCell>
                        <TableCell align="center">{owner.total_users?.toLocaleString()}</TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={owner.active_users?.toLocaleString()} 
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="center">{owner.avg_npcu || 0}</TableCell>
                        <TableCell align="center">
                          <Typography fontWeight="bold" color="primary.main">
                            {owner.total_npcu?.toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Chip 
                            label={`${owner.compliance_rate || 0}%`}
                            size="small"
                            color={owner.compliance_rate >= 70 ? 'success' : owner.compliance_rate >= 50 ? 'warning' : 'error'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Paper>

        {/* Quick Stats Footer */}
        <Box className="analytics-footer">
          <Typography variant="caption" color="textSecondary">
            Data as of {new Date().toLocaleDateString()} • 
            {kpiSummary?.users?.active?.toLocaleString()} active users • 
            {kpiSummary?.enrollments?.total?.toLocaleString()} total enrollments
            {(selectedRegion || selectedOwner || selectedTier) && ' • Filtered view'}
          </Typography>
        </Box>
      </div>
    </PageContent>
  );
}
