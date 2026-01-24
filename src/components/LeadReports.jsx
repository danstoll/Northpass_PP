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
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  Tooltip,
  Grid,
  TablePagination,
  TableSortLabel,
} from '@mui/material';
import {
  ArrowBack,
  Search,
  Assessment,
  Business,
  TrendingUp,
  Timeline,
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Refresh,
  Download,
  PersonAdd,
  CalendarMonth,
  Public,
  Person,
  Category,
  Source,
  Flag,
  InfoOutlined,
  ShowChart,
  CompareArrows,
  EmojiEvents,
  InsertChart,
  ArrowUpward,
  ArrowDownward,
  Speed,
  Star,
  LocalFireDepartment,
  FilterAlt,
  Warning,
  CheckCircle,
  TuneOutlined,
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
  FilterSelect,
  InfoButton,
} from './ui/NintexUI';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend,
  LineChart, Line, CartesianGrid, Area, AreaChart, ComposedChart,
  ReferenceLine, Scatter
} from 'recharts';
import './LeadReports.css';

const API_BASE = '/api/db/leads';

// Colors for charts
const COLORS = ['#FF6B35', '#6B4C9A', '#28a745', '#17a2b8', '#ffc107', '#dc3545', '#6c757d', '#20c997'];
const REGION_COLORS = {
  'Americas': '#FF6B35',
  'EMEA': '#6B4C9A',
  'APAC': '#28a745',
  'Emerging Markets': '#17a2b8',
  'Unassigned': '#6c757d'
};

// Tab definitions
const TABS = [
  { id: 'dashboard', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>Dashboard<InfoButton tooltip="Overview of all lead metrics including totals, conversion rates, and key performance indicators." /></Box>, icon: <Assessment /> },
  { id: 'by-partner', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>By Partner<InfoButton tooltip="Leads grouped by partner organization. Shows lead count, conversion rate, and registration status." /></Box>, icon: <Business /> },
  { id: 'by-month', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>By Month<InfoButton tooltip="Monthly lead trends showing volume over time with growth metrics." /></Box>, icon: <CalendarMonth /> },
  { id: 'by-region', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>By Region<InfoButton tooltip="Lead distribution across geographic regions (Americas, EMEA, APAC, etc.)." /></Box>, icon: <Public /> },
  { id: 'by-owner', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>By Owner<InfoButton tooltip="Leads grouped by account owner. Shows portfolio performance and conversion rates." /></Box>, icon: <Person /> },
  { id: 'by-source', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>By Source<InfoButton tooltip="Lead sources breakdown (web form, event, referral, etc.)." /></Box>, icon: <Source /> },
  { id: 'by-status', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>By Status<InfoButton tooltip="Lead pipeline stages showing distribution across status values." /></Box>, icon: <Flag /> },
  { id: 'trends', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>Trends<InfoButton tooltip="Time-series analysis of lead metrics with trend lines and seasonality patterns." /></Box>, icon: <TrendingUp /> },
  { id: 'comparisons', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>Comparisons<InfoButton tooltip="Compare metrics across different dimensions (region vs region, time periods, etc.)." /></Box>, icon: <CompareArrows /> },
  { id: 'top-performers', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>Top Performers<InfoButton tooltip="Leaderboard showing top partners, owners, and regions by lead metrics." /></Box>, icon: <EmojiEvents /> },
  { id: 'growth', label: <Box sx={{ display: 'flex', alignItems: 'center' }}>Growth Analysis<InfoButton tooltip="Growth rate calculations with period-over-period comparisons and projections." /></Box>, icon: <InsertChart /> },
];

export default function LeadReports({ onBack }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  
  // Filters
  const [months, setMonths] = useState(0); // 0 = All time
  // eslint-disable-next-line no-unused-vars
  const [region, setRegion] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [owner, setOwner] = useState('');
  // eslint-disable-next-line no-unused-vars
  const [tier, setTier] = useState('');
  
  // Chart options
  const [showTrendLine, setShowTrendLine] = useState({});
  
  // Pagination for tables
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortBy, setSortBy] = useState('lead_count');
  const [sortOrder, setSortOrder] = useState('desc');
  
  // Local table sort states for different tabs
  const [ownerTableSort, setOwnerTableSort] = useState({ field: 'lead_count', order: 'desc' });
  const [sourceTableSort, setSourceTableSort] = useState({ field: 'lead_count', order: 'desc' });
  const [trendsTableSort, setTrendsTableSort] = useState({ field: 'period', order: 'desc' });
  
  // New tabs state
  const [comparisonView, setComparisonView] = useState('mom'); // mom, yoy, quarters
  const [performerPeriod, setPerformerPeriod] = useState('30d'); // 7d, 30d, 90d, ytd, 1y, all
  const [normalizeOutliers, setNormalizeOutliers] = useState(false); // For growth analysis
  const [outlierMethod, setOutlierMethod] = useState('zscore'); // iqr, zscore, winsorize (default to zscore)
  const [zThreshold, setZThreshold] = useState(1.5); // Z-score threshold (1.5 catches Apr+Oct)

  // Fetch data based on active tab
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let endpoint = `${API_BASE}`;
      const params = new URLSearchParams();
      
      switch (activeTab) {
        case 'dashboard':
          endpoint += '/dashboard';
          break;
        case 'by-partner':
          endpoint += '/by-partner';
          params.set('limit', rowsPerPage);
          params.set('offset', page * rowsPerPage);
          params.set('sortBy', sortBy);
          params.set('sortOrder', sortOrder);
          break;
        case 'by-month':
          endpoint += '/by-month';
          params.set('months', months);
          if (region) params.set('region', region);
          if (owner) params.set('owner', owner);
          if (tier) params.set('tier', tier);
          break;
        case 'by-region':
          endpoint += '/by-region';
          params.set('months', months);
          break;
        case 'by-owner':
          endpoint += '/by-owner';
          params.set('months', months);
          params.set('limit', 30);
          break;
        case 'by-source':
          endpoint += '/by-source';
          params.set('months', months);
          params.set('limit', 20);
          break;
        case 'by-status':
          endpoint += '/by-status';
          params.set('months', months);
          break;
        case 'trends':
          endpoint += '/trends';
          params.set('months', months);
          params.set('groupBy', 'month');
          if (region) params.set('region', region);
          if (owner) params.set('owner', owner);
          if (tier) params.set('tier', tier);
          break;
        case 'comparisons':
          // Fetch all comparison data at once
          endpoint += `/comparisons/${comparisonView}`;
          if (comparisonView === 'mom') params.set('months', 12);
          if (comparisonView === 'yoy') params.set('years', 3);
          if (comparisonView === 'quarters') params.set('quarters', 8);
          break;
        case 'top-performers':
          endpoint += '/top-performers';
          params.set('period', performerPeriod);
          params.set('limit', 15);
          break;
        case 'growth':
          endpoint += '/growth-analysis';
          params.set('months', 12);
          params.set('normalize', normalizeOutliers);
          params.set('method', outlierMethod);
          if (outlierMethod === 'zscore') {
            params.set('zThreshold', zThreshold);
          }
          break;
        default:
          endpoint += '/stats';
      }
      
      const url = params.toString() ? `${endpoint}?${params}` : endpoint;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data');
      }
      
      setData(result.data);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, months, region, owner, tier, page, rowsPerPage, sortBy, sortOrder, comparisonView, performerPeriod, normalizeOutliers, outlierMethod, zThreshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset pagination when tab changes
  useEffect(() => {
    setPage(0);
  }, [activeTab]);

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const formatNumber = (num) => {
    if (num === null || num === undefined) return '0';
    return num.toLocaleString();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  // Reusable Chart Header with info button and trend toggle
  const ChartHeader = ({ title, icon, tooltip, chartKey, showTrendToggle = false }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon} {title}
        {tooltip && (
          <Tooltip title={tooltip} arrow placement="top">
            <IconButton size="small" sx={{ ml: 0.5 }}>
              <InfoOutlined fontSize="small" color="action" />
            </IconButton>
          </Tooltip>
        )}
      </Typography>
      {showTrendToggle && (
        <Tooltip title={showTrendLine[chartKey] ? "Hide trend line" : "Show trend line"}>
          <IconButton 
            size="small" 
            onClick={() => setShowTrendLine(prev => ({ ...prev, [chartKey]: !prev[chartKey] }))}
            color={showTrendLine[chartKey] ? "primary" : "default"}
          >
            <ShowChart fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );

  // Calculate trend line data (simple moving average)
  const calculateTrendLine = (data, key) => {
    if (!data || data.length < 2) return data;
    const window = Math.min(3, Math.floor(data.length / 2));
    return data.map((item, index) => {
      const start = Math.max(0, index - window + 1);
      const subset = data.slice(start, index + 1);
      const avg = subset.reduce((sum, d) => sum + (d[key] || 0), 0) / subset.length;
      return { ...item, trend: Math.round(avg) };
    });
  };

  // Render Dashboard Tab
  const renderDashboard = () => {
    if (!data) return null;
    
    const { totals, byMonth, topRegions, topPartners, topSources, lastSync } = data;
    const monthDataWithTrend = showTrendLine.dashboard ? calculateTrendLine(byMonth, 'lead_count') : byMonth;
    
    return (
      <Box>
        {/* Summary Stats */}
        <StatsRow columns={4}>
          <StatCard
            title="Total Leads"
            value={formatNumber(totals?.total_leads)}
            icon={<PersonAdd />}
            variant="primary"
            infoTooltip="Total number of leads synced from Impartner CRM"
          />
          <StatCard
            title="Last 30 Days"
            value={formatNumber(totals?.last_30_days)}
            icon={<CalendarMonth />}
            variant="success"
            infoTooltip="Leads registered in the last 30 days"
          />
          <StatCard
            title="Last 7 Days"
            value={formatNumber(totals?.last_7_days)}
            icon={<TrendingUp />}
            variant="warning"
            infoTooltip="Leads registered in the last 7 days"
          />
          <StatCard
            title="Partners with Leads"
            value={formatNumber(totals?.partners_with_leads)}
            icon={<Business />}
            infoTooltip="Number of partners who have at least one lead"
          />
        </StatsRow>

        {/* Charts Row */}
        <Box sx={{ display: 'flex', gap: 3, mt: 3, flexWrap: 'wrap' }}>
          {/* Leads by Month Chart */}
          <Paper sx={{ p: 3, flex: '2 1 500px', minWidth: 0 }}>
            <ChartHeader 
              title="Leads by Month" 
              icon={<BarChartIcon />} 
              tooltip="Monthly lead volume showing acquisition trends over time"
              chartKey="dashboard"
              showTrendToggle={true}
            />
            {byMonth && byMonth.length > 0 ? (
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthDataWithTrend} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month_label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="lead_count" fill="#FF6B35" name="Leads" />
                    {showTrendLine.dashboard && (
                      <Line type="monotone" dataKey="trend" stroke="#6B4C9A" strokeWidth={2} dot={false} name="Trend" />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <EmptyState message="No data available" />
            )}
          </Paper>

          {/* Top Regions */}
          <Paper sx={{ p: 3, flex: '1 1 300px', minWidth: 0 }}>
            <ChartHeader 
              title="Top Regions" 
              icon={<PieChartIcon />} 
              tooltip="Geographic distribution of leads by region"
            />
            {topRegions && topRegions.length > 0 ? (
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                    <Pie
                      data={topRegions}
                      dataKey="lead_count"
                      nameKey="region"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {topRegions.map((entry, index) => (
                        <Cell key={index} fill={REGION_COLORS[entry.region] || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <EmptyState message="No data available" />
            )}
          </Paper>
        </Box>

        {/* Tables Row */}
        <Box sx={{ display: 'flex', gap: 3, mt: 3, flexWrap: 'wrap' }}>
          {/* Top Partners */}
          <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
            <ChartHeader 
              title="Top Partners by Leads" 
              icon={<Business />} 
              tooltip="Partners ranked by total lead count"
            />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Partner</TableCell>
                  <TableCell>Tier</TableCell>
                  <TableCell align="right">Leads</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topPartners && topPartners.map((p, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{p.account_name}</TableCell>
                    <TableCell><TierBadge tier={p.partner_tier} /></TableCell>
                    <TableCell align="right">{formatNumber(p.lead_count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {/* Top Sources */}
          <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
            <ChartHeader 
              title="Top Lead Sources" 
              icon={<Source />} 
              tooltip="Marketing channels generating the most leads"
            />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Source</TableCell>
                  <TableCell align="right">Leads</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topSources && topSources.map((s, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{s.source || 'Unknown'}</TableCell>
                    <TableCell align="right">{formatNumber(s.lead_count)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>

        {/* Last Sync Info */}
        {lastSync && (
          <Box sx={{ mt: 2, textAlign: 'right' }}>
            <Typography variant="caption" color="text.secondary">
              Last synced: {formatDate(lastSync)}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  // Render By Partner Tab
  const renderByPartner = () => {
    if (!data || !Array.isArray(data)) return null;
    
    return (
      <Box>
        <Paper>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={sortBy === 'account_name'}
                    direction={sortBy === 'account_name' ? sortOrder : 'asc'}
                    onClick={() => handleSort('account_name')}
                  >
                    Partner
                  </TableSortLabel>
                </TableCell>
                <TableCell>Tier</TableCell>
                <TableCell>Region</TableCell>
                <TableCell>Owner</TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'lead_count'}
                    direction={sortBy === 'lead_count' ? sortOrder : 'desc'}
                    onClick={() => handleSort('lead_count')}
                  >
                    Total Leads
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sortBy === 'leads_last_30_days'}
                    direction={sortBy === 'leads_last_30_days' ? sortOrder : 'desc'}
                    onClick={() => handleSort('leads_last_30_days')}
                  >
                    Last 30 Days
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell>{row.account_name}</TableCell>
                  <TableCell><TierBadge tier={row.partner_tier} /></TableCell>
                  <TableCell>{row.account_region || '-'}</TableCell>
                  <TableCell>{row.account_owner || '-'}</TableCell>
                  <TableCell align="right">{formatNumber(row.lead_count)}</TableCell>
                  <TableCell align="right">{formatNumber(row.leads_last_30_days)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={-1}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100]}
          />
        </Paper>
      </Box>
    );
  };

  // Render By Month Tab
  const renderByMonth = () => {
    if (!data || !Array.isArray(data)) return null;
    const monthData = showTrendLine.byMonth ? calculateTrendLine(data, 'lead_count') : data;
    
    return (
      <Box>
        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Time Period</InputLabel>
            <Select value={months} onChange={(e) => setMonths(e.target.value)} label="Time Period">
              <MenuItem value={0}>All Time</MenuItem>
              <MenuItem value={6}>Last 6 months</MenuItem>
              <MenuItem value={12}>Last 12 months</MenuItem>
              <MenuItem value={24}>Last 24 months</MenuItem>
              <MenuItem value={60}>Last 5 years</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Chart */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <ChartHeader 
            title="Leads by Month" 
            icon={<BarChartIcon />} 
            tooltip="Monthly lead volume with partner count breakdown. Toggle trend line to see moving average."
            chartKey="byMonth"
            showTrendToggle={true}
          />
          {data.length > 0 ? (
            <Box sx={{ width: '100%', height: 400 }}>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={monthData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="lead_count" fill="#FF6B35" name="Leads" />
                  <Bar dataKey="partner_count" fill="#6B4C9A" name="Unique Partners" />
                  {showTrendLine.byMonth && (
                    <Line type="monotone" dataKey="trend" stroke="#28a745" strokeWidth={2} dot={false} name="Trend" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyState message="No data for selected period" />
          )}
        </Paper>

        {/* Data Table */}
        <Paper sx={{ p: 3 }}>
          <ChartHeader 
            title="Monthly Data" 
            icon={<CalendarMonth />} 
            tooltip="Detailed monthly breakdown"
          />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell align="right">Leads</TableCell>
                <TableCell align="right">Unique Partners</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell>{row.month}</TableCell>
                  <TableCell align="right">{formatNumber(row.lead_count)}</TableCell>
                  <TableCell align="right">{formatNumber(row.partner_count)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    );
  };

  // Render By Region Tab
  const renderByRegion = () => {
    if (!data || !Array.isArray(data)) return null;
    
    const total = data.reduce((sum, d) => sum + d.lead_count, 0);
    
    return (
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {/* Pie Chart */}
        <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
          <ChartHeader 
            title="Lead Distribution by Region" 
            icon={<PieChartIcon />} 
            tooltip="Geographic distribution of all leads by region"
          />
          <Box sx={{ width: '100%', height: 350 }}>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="lead_count"
                  nameKey="region"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data.map((entry, index) => (
                    <Cell key={index} fill={REGION_COLORS[entry.region] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        {/* Stats Cards */}
        <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
          <ChartHeader 
            title="Regional Breakdown" 
            icon={<Public />} 
            tooltip="Lead count and percentage by geographic region with progress bars"
          />
          {data.map((region, i) => (
            <Box key={i} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2">{region.region}</Typography>
                <Typography variant="body2" fontWeight="bold">
                  {formatNumber(region.lead_count)} ({((region.lead_count / total) * 100).toFixed(1)}%)
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(region.lead_count / total) * 100}
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  backgroundColor: '#e0e0e0',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: REGION_COLORS[region.region] || COLORS[i % COLORS.length]
                  }
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {formatNumber(region.partner_count)} partners • {formatNumber(region.last_30_days)} last 30 days
              </Typography>
            </Box>
          ))}
        </Paper>
      </Box>
    );
  };

  // Render By Owner Tab
  const renderByOwner = () => {
    if (!data || !Array.isArray(data)) return null;
    
    const sortedData = [...data].sort((a, b) => {
      const aVal = ownerTableSort.field === 'owner' ? (a.owner || '') : (a[ownerTableSort.field] || 0);
      const bVal = ownerTableSort.field === 'owner' ? (b.owner || '') : (b[ownerTableSort.field] || 0);
      if (typeof aVal === 'string') {
        return ownerTableSort.order === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return ownerTableSort.order === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    const handleOwnerSort = (field) => {
      setOwnerTableSort(prev => ({
        field,
        order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
      }));
    };
    
    return (
      <Box>
        {/* Bar Chart */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <ChartHeader 
            title="Leads by Account Owner" 
            icon={<BarChartIcon />} 
            tooltip="Top 15 account owners by lead count - shows total leads vs recent 30-day activity"
          />
          <Box sx={{ width: '100%', height: 420 }}>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data.slice(0, 15)} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="owner" type="category" width={150} tick={{ fontSize: 10 }} />
                <RechartsTooltip />
                <Legend />
                <Bar dataKey="lead_count" fill="#FF6B35" name="Total Leads" />
                <Bar dataKey="last_30_days" fill="#6B4C9A" name="Last 30 Days" />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        {/* Data Table */}
        <Paper sx={{ p: 3 }}>
          <ChartHeader 
            title="Owner Details" 
            icon={<Person />} 
            tooltip="All account owners with lead metrics - click column headers to sort"
          />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={ownerTableSort.field === 'owner'}
                    direction={ownerTableSort.field === 'owner' ? ownerTableSort.order : 'asc'}
                    onClick={() => handleOwnerSort('owner')}
                  >
                    Account Owner
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={ownerTableSort.field === 'partner_count'}
                    direction={ownerTableSort.field === 'partner_count' ? ownerTableSort.order : 'desc'}
                    onClick={() => handleOwnerSort('partner_count')}
                  >
                    Partners
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={ownerTableSort.field === 'lead_count'}
                    direction={ownerTableSort.field === 'lead_count' ? ownerTableSort.order : 'desc'}
                    onClick={() => handleOwnerSort('lead_count')}
                  >
                    Total Leads
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={ownerTableSort.field === 'last_30_days'}
                    direction={ownerTableSort.field === 'last_30_days' ? ownerTableSort.order : 'desc'}
                    onClick={() => handleOwnerSort('last_30_days')}
                  >
                    Last 30 Days
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell>{row.owner}</TableCell>
                  <TableCell align="right">{formatNumber(row.partner_count)}</TableCell>
                  <TableCell align="right">{formatNumber(row.lead_count)}</TableCell>
                  <TableCell align="right">{formatNumber(row.last_30_days)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    );
  };

  // Render By Source Tab
  const renderBySource = () => {
    if (!data || !Array.isArray(data)) return null;
    
    const sortedData = [...data].sort((a, b) => {
      const aVal = sourceTableSort.field === 'source' ? (a.source || '') : (a[sourceTableSort.field] || 0);
      const bVal = sourceTableSort.field === 'source' ? (b.source || '') : (b[sourceTableSort.field] || 0);
      if (typeof aVal === 'string') {
        return sourceTableSort.order === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return sourceTableSort.order === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    const handleSourceSort = (field) => {
      setSourceTableSort(prev => ({
        field,
        order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
      }));
    };
    
    return (
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {/* Pie Chart */}
        <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
          <ChartHeader 
            title="Lead Sources" 
            icon={<PieChartIcon />} 
            tooltip="Distribution of leads by marketing source/channel (top 8)"
          />
          <Box sx={{ width: '100%', height: 350 }}>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={data.slice(0, 8)}
                  dataKey="lead_count"
                  nameKey="source"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                >
                  {data.slice(0, 8).map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        {/* Table */}
        <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
          <ChartHeader 
            title="All Sources" 
            icon={<Source />} 
            tooltip="Complete list of all lead sources - click column headers to sort"
          />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={sourceTableSort.field === 'source'}
                    direction={sourceTableSort.field === 'source' ? sourceTableSort.order : 'asc'}
                    onClick={() => handleSourceSort('source')}
                  >
                    Source
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sourceTableSort.field === 'partner_count'}
                    direction={sourceTableSort.field === 'partner_count' ? sourceTableSort.order : 'desc'}
                    onClick={() => handleSourceSort('partner_count')}
                  >
                    Partners
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sourceTableSort.field === 'lead_count'}
                    direction={sourceTableSort.field === 'lead_count' ? sourceTableSort.order : 'desc'}
                    onClick={() => handleSourceSort('lead_count')}
                  >
                    Leads
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={sourceTableSort.field === 'last_30_days'}
                    direction={sourceTableSort.field === 'last_30_days' ? sourceTableSort.order : 'desc'}
                    onClick={() => handleSourceSort('last_30_days')}
                  >
                    Last 30d
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedData.map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length] }} />
                      {row.source}
                    </Box>
                  </TableCell>
                  <TableCell align="right">{formatNumber(row.partner_count)}</TableCell>
                  <TableCell align="right">{formatNumber(row.lead_count)}</TableCell>
                  <TableCell align="right">{formatNumber(row.last_30_days)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    );
  };

  // Render By Status Tab
  const renderByStatus = () => {
    if (!data || !Array.isArray(data)) return null;
    
    const total = data.reduce((sum, d) => sum + d.lead_count, 0);
    
    return (
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {/* Pie Chart */}
        <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
          <ChartHeader 
            title="Lead Status Distribution" 
            icon={<PieChartIcon />} 
            tooltip="Distribution of leads by their current status in the sales pipeline"
          />
          <Box sx={{ width: '100%', height: 350 }}>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="lead_count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  label={({ name, percent }) => percent > 0.05 ? `${name}` : ''}
                >
                  {data.map((entry, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Box>
        </Paper>

        {/* Stats */}
        <Paper sx={{ p: 3, flex: '1 1 400px', minWidth: 0 }}>
          <ChartHeader 
            title="Status Breakdown" 
            icon={<Flag />} 
            tooltip="Lead status count with percentage of total and recent activity"
          />
          {data.map((status, i) => (
            <Box key={i} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: COLORS[i % COLORS.length] }} />
                  <Typography variant="body2">{status.status}</Typography>
                </Box>
                <Typography variant="body2" fontWeight="bold">
                  {formatNumber(status.lead_count)} ({((status.lead_count / total) * 100).toFixed(1)}%)
                </Typography>
              </Box>
              <LinearProgress 
                variant="determinate" 
                value={(status.lead_count / total) * 100}
                sx={{ 
                  height: 8, 
                  borderRadius: 4,
                  backgroundColor: '#e0e0e0',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: COLORS[i % COLORS.length]
                  }
                }}
              />
              <Typography variant="caption" color="text.secondary">
                {formatNumber(status.last_30_days)} in last 30 days
              </Typography>
            </Box>
          ))}
        </Paper>
      </Box>
    );
  };

  // Render Trends Tab
  const renderTrends = () => {
    if (!data) return null;
    
    const { trends, summary } = data;
    const trendsWithTrend = showTrendLine.trends && trends ? calculateTrendLine(trends, 'lead_count') : trends;
    
    // Sort trends data
    const sortedTrends = trends ? [...trends].sort((a, b) => {
      const aVal = trendsTableSort.field === 'period' ? (a.period || '') : (a[trendsTableSort.field] || 0);
      const bVal = trendsTableSort.field === 'period' ? (b.period || '') : (b[trendsTableSort.field] || 0);
      if (typeof aVal === 'string') {
        return trendsTableSort.order === 'desc' ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      return trendsTableSort.order === 'desc' ? bVal - aVal : aVal - bVal;
    }) : [];
    
    const handleTrendsSort = (field) => {
      setTrendsTableSort(prev => ({
        field,
        order: prev.field === field && prev.order === 'desc' ? 'asc' : 'desc'
      }));
    };
    
    return (
      <Box>
        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Time Period</InputLabel>
            <Select value={months} onChange={(e) => setMonths(e.target.value)} label="Time Period">
              <MenuItem value={0}>All Time</MenuItem>
              <MenuItem value={12}>Last 12 months</MenuItem>
              <MenuItem value={24}>Last 24 months</MenuItem>
              <MenuItem value={60}>Last 5 years</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Summary Stats */}
        {summary && (
          <StatsRow columns={3}>
            <StatCard
              title="Total Leads"
              value={formatNumber(summary.totalLeads)}
              icon={<PersonAdd />}
              variant="primary"
              infoTooltip="Total leads in selected time period"
            />
            <StatCard
              title="Avg per Month"
              value={formatNumber(summary.avgPerPeriod)}
              icon={<Timeline />}
              infoTooltip="Average leads per month"
            />
            <StatCard
              title="Periods"
              value={summary.periods}
              icon={<CalendarMonth />}
              infoTooltip="Number of months with data"
            />
          </StatsRow>
        )}

        {/* Trend Chart */}
        <Paper sx={{ p: 3, mt: 3 }}>
          <ChartHeader 
            title="Lead Trend" 
            icon={<TrendingUp />} 
            tooltip="Lead volume and growth trends over time. Toggle trend line for moving average."
            chartKey="trends"
            showTrendToggle={true}
          />
          {trendsWithTrend && trendsWithTrend.length > 0 ? (
            <Box sx={{ width: '100%', height: 420 }}>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={trendsWithTrend} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                  <RechartsTooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="lead_count" stroke="#FF6B35" strokeWidth={2} name="Leads" dot={{ r: 3 }} />
                  <Line yAxisId="left" type="monotone" dataKey="unique_partners" stroke="#6B4C9A" strokeWidth={2} name="Unique Partners" dot={{ r: 3 }} />
                  <Line yAxisId="right" type="monotone" dataKey="growth" stroke="#28a745" strokeDasharray="5 5" name="Growth %" dot={{ r: 2 }} />
                  {showTrendLine.trends && (
                    <Line yAxisId="left" type="monotone" dataKey="trend" stroke="#17a2b8" strokeWidth={2} dot={false} name="Trend Line" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyState message="No trend data available" />
          )}
        </Paper>

        {/* Data Table */}
        {trends && (
          <Paper sx={{ p: 3, mt: 3 }}>
            <ChartHeader 
              title="Trend Details" 
              icon={<CalendarMonth />} 
              tooltip="Monthly breakdown with growth metrics - click column headers to sort"
            />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={trendsTableSort.field === 'period'}
                      direction={trendsTableSort.field === 'period' ? trendsTableSort.order : 'desc'}
                      onClick={() => handleTrendsSort('period')}
                    >
                      Period
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={trendsTableSort.field === 'lead_count'}
                      direction={trendsTableSort.field === 'lead_count' ? trendsTableSort.order : 'desc'}
                      onClick={() => handleTrendsSort('lead_count')}
                    >
                      Leads
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={trendsTableSort.field === 'unique_partners'}
                      direction={trendsTableSort.field === 'unique_partners' ? trendsTableSort.order : 'desc'}
                      onClick={() => handleTrendsSort('unique_partners')}
                    >
                      Unique Partners
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={trendsTableSort.field === 'unique_sources'}
                      direction={trendsTableSort.field === 'unique_sources' ? trendsTableSort.order : 'desc'}
                      onClick={() => handleTrendsSort('unique_sources')}
                    >
                      Unique Sources
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={trendsTableSort.field === 'growth'}
                      direction={trendsTableSort.field === 'growth' ? trendsTableSort.order : 'desc'}
                      onClick={() => handleTrendsSort('growth')}
                    >
                      Growth
                    </TableSortLabel>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedTrends.map((row, i) => (
                  <TableRow key={i} hover>
                    <TableCell>{row.period}</TableCell>
                    <TableCell align="right">{formatNumber(row.lead_count)}</TableCell>
                    <TableCell align="right">{formatNumber(row.unique_partners)}</TableCell>
                    <TableCell align="right">{formatNumber(row.unique_sources)}</TableCell>
                    <TableCell align="right">
                      {row.growth !== null ? (
                        <Chip 
                          label={`${row.growth > 0 ? '+' : ''}${row.growth}%`}
                          size="small"
                          color={row.growth > 0 ? 'success' : row.growth < 0 ? 'error' : 'default'}
                        />
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    );
  };

  // Render Comparisons Tab (MoM, YoY, Quarters)
  const renderComparisons = () => {
    if (!data) return null;
    
    const { comparisons, monthlyComparison, yearlyComparisons, quarters, summary } = data;
    
    // Prepare chart data based on view
    const chartData = comparisonView === 'yoy' && monthlyComparison 
      ? monthlyComparison 
      : comparisonView === 'quarters' && quarters 
      ? quarters 
      : comparisons || [];
    
    return (
      <Box>
        {/* View Selector */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Comparison Type</InputLabel>
            <Select value={comparisonView} onChange={(e) => setComparisonView(e.target.value)} label="Comparison Type">
              <MenuItem value="mom">Month over Month</MenuItem>
              <MenuItem value="yoy">Year over Year</MenuItem>
              <MenuItem value="quarters">Quarterly</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Compare lead performance across different time periods to identify trends and seasonality">
            <IconButton size="small">
              <InfoOutlined />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Summary Stats */}
        {summary && (
          <StatsRow columns={4}>
            <StatCard
              title={comparisonView === 'yoy' ? "Current Year" : comparisonView === 'quarters' ? "Avg Quarterly" : "Current Month"}
              value={formatNumber(
                comparisonView === 'yoy' ? summary.currentYearTotal : 
                comparisonView === 'quarters' ? summary.avgQuarterlyLeads :
                summary.currentMonth?.lead_count || 0
              )}
              icon={<PersonAdd />}
              variant="primary"
            />
            <StatCard
              title={comparisonView === 'yoy' ? "Last Year" : comparisonView === 'quarters' ? "Total Quarters" : "Avg Monthly"}
              value={formatNumber(
                comparisonView === 'yoy' ? summary.lastYearTotal :
                comparisonView === 'quarters' ? summary.totalQuarters :
                summary.avgMonthlyLeads || 0
              )}
              icon={<CalendarMonth />}
            />
            <StatCard
              title="Avg Growth %"
              value={`${summary.avgGrowthPercent > 0 ? '+' : ''}${summary.avgGrowthPercent || 0}%`}
              icon={summary.avgGrowthPercent > 0 ? <ArrowUpward /> : <ArrowDownward />}
              variant={summary.avgGrowthPercent > 0 ? 'success' : summary.avgGrowthPercent < 0 ? 'error' : 'default'}
              infoTooltip="Average change between consecutive periods"
            />
            <StatCard
              title={comparisonView === 'yoy' ? "Best Month" : "Best Period"}
              value={formatNumber(summary.bestMonth?.lead_count || summary.bestPeriod?.lead_count || 0)}
              subtitle={summary.bestMonth?.month_label || summary.bestPeriod?.quarter || ''}
              icon={<EmojiEvents />}
              variant="warning"
            />
          </StatsRow>
        )}

        {/* Comparison Chart */}
        <Paper sx={{ p: 3, mt: 3 }}>
          <ChartHeader 
            title={comparisonView === 'mom' ? 'Month over Month Comparison' : comparisonView === 'yoy' ? 'Year over Year by Month' : 'Quarterly Comparison'} 
            icon={<CompareArrows />} 
            tooltip={comparisonView === 'yoy' ? 'Compare same months across current and previous year' : 'Track lead volume changes between consecutive periods'}
          />
          {chartData && chartData.length > 0 ? (
            <Box sx={{ width: '100%', height: 420 }}>
              <ResponsiveContainer width="100%" height={400}>
                {comparisonView === 'yoy' && monthlyComparison ? (
                  <ComposedChart data={monthlyComparison} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month_name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="current_year" fill="#FF6B35" name={`${data.currentYear || new Date().getFullYear()}`} />
                    <Bar dataKey="last_year" fill="#6B4C9A" name={`${(data.currentYear || new Date().getFullYear()) - 1}`} />
                    <Line type="monotone" dataKey="change" stroke="#28a745" strokeWidth={2} dot={{ r: 3 }} name="Change" />
                  </ComposedChart>
                ) : (
                  <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey={comparisonView === 'quarters' ? 'quarter' : 'month_label'} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} domain={[-100, 100]} />
                    <RechartsTooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="lead_count" fill="#FF6B35" name="Leads" />
                    <Line yAxisId="right" type="monotone" dataKey={comparisonView === 'quarters' ? 'change_percent' : 'lead_change_percent'} stroke="#6B4C9A" strokeWidth={2} name="Change %" dot={{ r: 3 }} />
                    <ReferenceLine yAxisId="right" y={0} stroke="#999" strokeDasharray="3 3" />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyState message="No comparison data available" />
          )}
        </Paper>

        {/* Comparison Table */}
        <Paper sx={{ p: 3, mt: 3 }}>
          <ChartHeader 
            title="Period Details" 
            icon={<Timeline />} 
            tooltip="Detailed breakdown with change metrics for each period"
          />
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Period</TableCell>
                <TableCell align="right">Leads</TableCell>
                <TableCell align="right">Previous</TableCell>
                <TableCell align="right">Change</TableCell>
                <TableCell align="right">Change %</TableCell>
                <TableCell align="right">Partners</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(comparisonView === 'yoy' && yearlyComparisons ? yearlyComparisons : chartData).map((row, i) => (
                <TableRow key={i} hover>
                  <TableCell>
                    {comparisonView === 'yoy' ? row.year : 
                     comparisonView === 'quarters' ? row.quarter : 
                     row.month_label}
                  </TableCell>
                  <TableCell align="right">{formatNumber(row.lead_count)}</TableCell>
                  <TableCell align="right">
                    {formatNumber(
                      comparisonView === 'yoy' ? row.prev_year_leads :
                      comparisonView === 'quarters' ? row.prev_quarter_leads :
                      row.prev_month_leads
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                      {(row.lead_change || 0) > 0 && <ArrowUpward fontSize="small" color="success" />}
                      {(row.lead_change || 0) < 0 && <ArrowDownward fontSize="small" color="error" />}
                      {formatNumber(Math.abs(row.lead_change || 0))}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Chip 
                      label={`${(row.lead_change_percent || row.change_percent || 0) > 0 ? '+' : ''}${row.lead_change_percent || row.change_percent || 0}%`}
                      size="small"
                      color={(row.lead_change_percent || row.change_percent || 0) > 0 ? 'success' : (row.lead_change_percent || row.change_percent || 0) < 0 ? 'error' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="right">{formatNumber(row.unique_partners)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      </Box>
    );
  };

  // Render Top Performers Tab
  const renderTopPerformers = () => {
    if (!data) return null;
    
    const { topPerformers, risingStars, periodTotals, period } = data;
    
    const periodLabels = {
      '7d': 'Last 7 Days',
      '30d': 'Last 30 Days',
      '90d': 'Last 90 Days',
      'ytd': 'Year to Date',
      '1y': 'Last Year',
      'all': 'All Time'
    };
    
    return (
      <Box>
        {/* Period Selector */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap', alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Time Period</InputLabel>
            <Select value={performerPeriod} onChange={(e) => setPerformerPeriod(e.target.value)} label="Time Period">
              <MenuItem value="7d">Last 7 Days</MenuItem>
              <MenuItem value="30d">Last 30 Days</MenuItem>
              <MenuItem value="90d">Last 90 Days</MenuItem>
              <MenuItem value="ytd">Year to Date</MenuItem>
              <MenuItem value="1y">Last Year</MenuItem>
              <MenuItem value="all">All Time</MenuItem>
            </Select>
          </FormControl>
          <Chip 
            label={periodLabels[period] || period} 
            color="primary" 
            icon={<CalendarMonth />}
          />
        </Box>

        {/* Summary Stats */}
        {periodTotals && (
          <StatsRow columns={3}>
            <StatCard
              title="Total Leads"
              value={formatNumber(periodTotals.total_leads)}
              subtitle={`in ${periodLabels[period]?.toLowerCase() || period}`}
              icon={<PersonAdd />}
              variant="primary"
            />
            <StatCard
              title="Active Partners"
              value={formatNumber(periodTotals.active_partners)}
              icon={<Business />}
              infoTooltip="Partners with at least one lead in this period"
            />
            <StatCard
              title="Rising Stars"
              value={risingStars?.length || 0}
              icon={<LocalFireDepartment />}
              variant="warning"
              infoTooltip="Partners with increasing lead volume vs previous period"
            />
          </StatsRow>
        )}

        <Box sx={{ display: 'flex', gap: 3, mt: 3, flexWrap: 'wrap' }}>
          {/* Top Performers List */}
          <Paper sx={{ p: 3, flex: '2 1 600px', minWidth: 0 }}>
            <ChartHeader 
              title="Top Performers" 
              icon={<EmojiEvents />} 
              tooltip="Partners with the most leads in selected time period, ranked by volume and velocity"
            />
            {topPerformers && topPerformers.length > 0 ? (
              <>
                {/* Bar Chart */}
                <Box sx={{ width: '100%', height: 320 }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topPerformers.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="account_name" tick={{ fontSize: 10 }} width={95} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="period_leads" fill="#FF6B35" name="Leads" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>

                {/* Detailed Table */}
                <Table size="small" sx={{ mt: 2 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>#</TableCell>
                      <TableCell>Partner</TableCell>
                      <TableCell>Tier</TableCell>
                      <TableCell align="right">Period Leads</TableCell>
                      <TableCell align="right">Share %</TableCell>
                      <TableCell align="right">Velocity</TableCell>
                      <TableCell>Region</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {topPerformers.map((p, i) => (
                      <TableRow key={p.id} hover sx={{ bgcolor: i < 3 ? 'rgba(255, 107, 53, 0.05)' : 'inherit' }}>
                        <TableCell>
                          {i === 0 && <span style={{ fontSize: '1.2em' }}>🥇</span>}
                          {i === 1 && <span style={{ fontSize: '1.2em' }}>🥈</span>}
                          {i === 2 && <span style={{ fontSize: '1.2em' }}>🥉</span>}
                          {i > 2 && (i + 1)}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={i < 3 ? 600 : 400}>
                            {p.account_name}
                          </Typography>
                        </TableCell>
                        <TableCell><TierBadge tier={p.partner_tier} /></TableCell>
                        <TableCell align="right">
                          <Typography fontWeight={600}>{formatNumber(p.period_leads)}</Typography>
                        </TableCell>
                        <TableCell align="right">{p.period_share}%</TableCell>
                        <TableCell align="right">
                          <Tooltip title="Leads per day">
                            <Chip 
                              icon={<Speed />} 
                              label={p.velocity} 
                              size="small" 
                              variant="outlined"
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell>{p.account_region || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <EmptyState message="No performers found for this period" />
            )}
          </Paper>

          {/* Rising Stars */}
          <Paper sx={{ p: 3, flex: '1 1 300px', minWidth: 280 }}>
            <ChartHeader 
              title="Rising Stars" 
              icon={<LocalFireDepartment />} 
              tooltip="Partners showing the most growth compared to previous 30 days"
            />
            {risingStars && risingStars.length > 0 ? (
              <Box>
                {risingStars.map((star) => (
                  <Box 
                    key={star.id} 
                    sx={{ 
                      p: 2, 
                      mb: 2, 
                      borderRadius: 1, 
                      bgcolor: 'rgba(255, 193, 7, 0.08)',
                      border: '1px solid rgba(255, 193, 7, 0.2)'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Star color="warning" fontSize="small" />
                      <Typography variant="subtitle2" fontWeight={600}>
                        {star.account_name}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography variant="body2" color="text.secondary">
                        {star.prev_30_days} → {star.last_30_days} leads
                      </Typography>
                      <Chip 
                        icon={<ArrowUpward fontSize="small" />}
                        label={`+${star.growth_percent}%`}
                        size="small"
                        color="success"
                      />
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(100, (star.last_30_days / (star.prev_30_days || 1)) * 50)}
                      sx={{ mt: 1, height: 6, borderRadius: 1 }}
                      color="warning"
                    />
                  </Box>
                ))}
              </Box>
            ) : (
              <EmptyState message="No rising stars identified" />
            )}
          </Paper>
        </Box>
      </Box>
    );
  };

  // Render Growth Analysis Tab
  const renderGrowthAnalysis = () => {
    if (!data) return null;
    
    const { monthlyData, projections, regression, summary, statistics, outliers } = data;
    
    // Combine actual data with projections for chart
    const chartData = [
      ...(monthlyData || []),
      ...(projections || []).map(p => ({ ...p, lead_count: null }))
    ];
    
    // Create linear regression line data - use normalized values if enabled
    const regressionLineData = monthlyData?.map((m, i) => ({
      ...m,
      display_value: normalizeOutliers ? m.normalized_value : m.lead_count,
      regression_line: regression ? Math.round(parseFloat(regression.slope) * i + parseFloat(regression.intercept)) : null
    })) || [];
    
    const methodLabels = {
      'iqr': 'IQR (Interquartile Range)',
      'zscore': 'Z-Score (±2σ)',
      'winsorize': 'Winsorize (5th-95th %ile)'
    };
    
    return (
      <Box>
        {/* Normalization Controls */}
        <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(107, 76, 154, 0.04)' }}>
          <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TuneOutlined color="primary" />
              <Typography variant="subtitle2">Outlier Handling:</Typography>
            </Box>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Detection Method</InputLabel>
              <Select 
                value={outlierMethod} 
                onChange={(e) => setOutlierMethod(e.target.value)} 
                label="Detection Method"
              >
                <MenuItem value="iqr">IQR (Interquartile Range)</MenuItem>
                <MenuItem value="zscore">Z-Score (Std Dev)</MenuItem>
                <MenuItem value="winsorize">Winsorize (5-95th %ile)</MenuItem>
              </Select>
            </FormControl>
            {/* Z-Score Threshold Slider */}
            {outlierMethod === 'zscore' && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                <Typography variant="body2" color="text.secondary">σ Threshold:</Typography>
                <Select 
                  size="small" 
                  value={zThreshold} 
                  onChange={(e) => setZThreshold(e.target.value)}
                  sx={{ minWidth: 90 }}
                >
                  <MenuItem value={1.0}>±1.0σ (strict)</MenuItem>
                  <MenuItem value={1.5}>±1.5σ</MenuItem>
                  <MenuItem value={2.0}>±2.0σ (standard)</MenuItem>
                  <MenuItem value={2.5}>±2.5σ (lenient)</MenuItem>
                  <MenuItem value={3.0}>±3.0σ (very lenient)</MenuItem>
                </Select>
              </Box>
            )}
            <Chip 
              icon={normalizeOutliers ? <FilterAlt /> : <Warning />}
              label={normalizeOutliers ? 'Normalized View' : 'Raw Data (with outliers)'}
              color={normalizeOutliers ? 'success' : 'warning'}
              variant={normalizeOutliers ? 'filled' : 'outlined'}
              onClick={() => setNormalizeOutliers(!normalizeOutliers)}
              sx={{ cursor: 'pointer' }}
            />
            {outliers && outliers.count > 0 && (
              <Chip 
                icon={<Warning />}
                label={`${outliers.count} outlier${outliers.count > 1 ? 's' : ''} detected`}
                color="warning"
                size="small"
              />
            )}
            <Tooltip title="Outliers are data points that deviate significantly from the typical pattern. Normalizing them gives a clearer view of the underlying trend.">
              <IconButton size="small">
                <InfoOutlined fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Paper>

        {/* Summary Stats */}
        {summary && (
          <StatsRow columns={4}>
            <StatCard
              title="Trend Direction"
              value={summary.trendDirection === 'upward' ? '📈 Upward' : summary.trendDirection === 'downward' ? '📉 Downward' : '➡️ Flat'}
              icon={<TrendingUp />}
              variant={summary.trendDirection === 'upward' ? 'success' : summary.trendDirection === 'downward' ? 'error' : 'default'}
              infoTooltip={`Overall trend based on ${normalizeOutliers ? 'normalized' : 'raw'} data regression analysis`}
            />
            <StatCard
              title="Total Growth"
              value={`${summary.totalGrowthPercent > 0 ? '+' : ''}${summary.totalGrowthPercent}%`}
              icon={summary.totalGrowthPercent > 0 ? <ArrowUpward /> : <ArrowDownward />}
              variant={summary.totalGrowthPercent > 0 ? 'success' : 'error'}
              infoTooltip="Growth from first month to last month in period"
            />
            <StatCard
              title="Avg Monthly Growth"
              value={`${summary.avgMonthlyGrowthPercent > 0 ? '+' : ''}${summary.avgMonthlyGrowthPercent}%`}
              icon={<Speed />}
              infoTooltip="Average month-over-month growth rate"
            />
            <StatCard
              title="Model Confidence"
              value={summary.confidence === 'high' ? '🎯 High' : summary.confidence === 'medium' ? '📊 Medium' : '📉 Low'}
              subtitle={`R² = ${regression?.rSquared || '-'}`}
              icon={<InsertChart />}
              variant={summary.confidence === 'high' ? 'success' : summary.confidence === 'medium' ? 'warning' : 'default'}
              infoTooltip="How well the linear model fits the data. Higher R² = better fit. Normalizing outliers typically improves confidence."
            />
          </StatsRow>
        )}

        {/* Outlier Summary */}
        {outliers && outliers.count > 0 && (
          <Paper sx={{ p: 2, mt: 3, bgcolor: 'rgba(255, 193, 7, 0.08)', border: '1px solid rgba(255, 193, 7, 0.3)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Warning color="warning" />
              <Typography variant="subtitle1" fontWeight={600}>
                {outliers.count} Outlier{outliers.count > 1 ? 's' : ''} Detected ({outliers.percentage}% of data)
              </Typography>
              <Chip label={methodLabels[outlierMethod] || outlierMethod} size="small" variant="outlined" />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {outliers.months.map((o, i) => (
                <Box 
                  key={i} 
                  sx={{ 
                    p: 1.5, 
                    borderRadius: 1, 
                    bgcolor: 'white',
                    border: '1px solid rgba(255, 193, 7, 0.5)',
                    minWidth: 150
                  }}
                >
                  <Typography variant="caption" color="text.secondary">{o.month}</Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {formatNumber(o.value)} leads
                    <Chip 
                      label={`${o.deviation > 0 ? '+' : ''}${o.deviation}%`}
                      size="small"
                      color={o.deviation > 0 ? 'error' : 'info'}
                      sx={{ ml: 1 }}
                    />
                  </Typography>
                  {normalizeOutliers && (
                    <Typography variant="caption" color="success.main">
                      → Normalized to {formatNumber(o.normalized)}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        {/* Growth Chart with Linear Regression */}
        <Paper sx={{ p: 3, mt: 3 }}>
          <ChartHeader 
            title={normalizeOutliers ? "Growth Trend (Normalized)" : "Growth Trend with Linear Regression"} 
            icon={<InsertChart />} 
            tooltip={`Linear equation: ${regression?.equation || 'N/A'}. ${normalizeOutliers ? 'Outliers have been capped to reduce their impact on the trend line.' : 'Toggle normalization above to reduce outlier impact.'}`}
            chartKey="growth"
            showTrendToggle={true}
          />
          {chartData && chartData.length > 0 ? (
            <Box sx={{ width: '100%', height: 420 }}>
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={regressionLineData} margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="month_label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip 
                    formatter={(value, name, props) => {
                      if (name === 'Linear Trend') return [value, 'Trend Line'];
                      if (name === 'Actual Leads' && props?.payload?.is_outlier) {
                        return [value, `Actual (Outlier: ${props.payload.deviation_percent > 0 ? '+' : ''}${props.payload.deviation_percent}%)`];
                      }
                      return [value, name];
                    }}
                    labelFormatter={(label) => label}
                  />
                  <Legend />
                  <Bar 
                    dataKey={normalizeOutliers ? "normalized_value" : "lead_count"} 
                    fill="#FF6B35" 
                    name={normalizeOutliers ? "Normalized Leads" : "Actual Leads"}
                  />
                  {/* Show original values as scatter points when normalized */}
                  {normalizeOutliers && (
                    <Scatter 
                      dataKey="lead_count" 
                      fill="#dc3545" 
                      name="Original (Outliers)" 
                      shape="diamond"
                    />
                  )}
                  <Line 
                    type="monotone" 
                    dataKey="regression_line" 
                    stroke="#6B4C9A" 
                    strokeWidth={3} 
                    strokeDasharray="0"
                    dot={false}
                    name="Linear Trend"
                  />
                  {showTrendLine.growth && (
                    <Line 
                      type="monotone" 
                      dataKey="trend_value" 
                      stroke="#28a745" 
                      strokeWidth={2} 
                      strokeDasharray="5 5"
                      dot={false}
                      name="Moving Avg"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </Box>
          ) : (
            <EmptyState message="No growth data available" />
          )}
        </Paper>

        {/* Statistics Panel */}
        {statistics && (
          <Paper sx={{ p: 3, mt: 3 }}>
            <ChartHeader 
              title="Statistical Summary" 
              icon={<Assessment />} 
              tooltip="Key statistics used for outlier detection and trend analysis"
            />
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Mean</Typography>
                <Typography variant="h6">{formatNumber(statistics.mean)} leads</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Median</Typography>
                <Typography variant="h6">{formatNumber(statistics.median)} leads</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Std Deviation</Typography>
                <Typography variant="h6">±{formatNumber(statistics.stdDev)}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">IQR Range</Typography>
                <Typography variant="h6">{formatNumber(statistics.q1)} - {formatNumber(statistics.q3)}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Outlier Bounds</Typography>
                <Typography variant="h6">{formatNumber(statistics.lowerBound)} - {formatNumber(statistics.upperBound)}</Typography>
              </Box>
            </Box>
          </Paper>
        )}

        {/* Projections */}
        {projections && projections.length > 0 && (
          <Paper sx={{ p: 3, mt: 3 }}>
            <ChartHeader 
              title="3-Month Projections" 
              icon={<Timeline />} 
              tooltip={`Estimated future lead counts based on ${normalizeOutliers ? 'normalized' : 'raw'} linear regression model.`}
            />
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {projections.map((proj, i) => (
                <Box 
                  key={i} 
                  sx={{ 
                    flex: '1 1 200px',
                    p: 3, 
                    borderRadius: 2, 
                    bgcolor: 'rgba(107, 76, 154, 0.08)',
                    border: '1px solid rgba(107, 76, 154, 0.2)',
                    textAlign: 'center'
                  }}
                >
                  <Typography variant="overline" color="text.secondary">
                    {proj.month_label}
                  </Typography>
                  <Typography variant="h4" fontWeight={700} color="primary">
                    {formatNumber(proj.projected_leads)}
                  </Typography>
                  <Chip 
                    label="Projected" 
                    size="small" 
                    color="secondary" 
                    variant="outlined"
                    sx={{ mt: 1 }}
                  />
                </Box>
              ))}
            </Box>
          </Paper>
        )}

        {/* Regression Details */}
        {regression && (
          <Paper sx={{ p: 3, mt: 3 }}>
            <ChartHeader 
              title="Regression Model Details" 
              icon={<Assessment />} 
              tooltip="Technical details of the linear regression analysis"
            />
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Equation</Typography>
                <Typography variant="h6" fontFamily="monospace">{regression.equation}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Slope</Typography>
                <Typography variant="h6">
                  {parseFloat(regression.slope) > 0 ? '+' : ''}{regression.slope} leads/month
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">R² (Fit Quality)</Typography>
                <Typography variant="h6">{regression.rSquared}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Baseline</Typography>
                <Typography variant="h6">{regression.intercept} leads</Typography>
              </Box>
              {regression.normalized && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">Data Mode</Typography>
                  <Chip label="Normalized" color="success" size="small" icon={<CheckCircle />} />
                </Box>
              )}
            </Box>
          </Paper>
        )}

        {/* Monthly Breakdown Table */}
        {monthlyData && (
          <Paper sx={{ p: 3, mt: 3 }}>
            <ChartHeader 
              title="Monthly Breakdown with Outlier Analysis" 
              icon={<CalendarMonth />} 
              tooltip="Compare actual values to predicted values. Outliers are highlighted with their Z-scores."
            />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Month</TableCell>
                  <TableCell align="right">Actual Leads</TableCell>
                  {normalizeOutliers && <TableCell align="right">Normalized</TableCell>}
                  <TableCell align="right">Trend Value</TableCell>
                  <TableCell align="right">Z-Score</TableCell>
                  <TableCell align="right">Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {monthlyData.map((row, i) => (
                  <TableRow 
                    key={i} 
                    hover
                    sx={{ bgcolor: row.is_outlier ? 'rgba(255, 193, 7, 0.08)' : 'inherit' }}
                  >
                    <TableCell>
                      {row.month_label}
                      {row.is_outlier && <Warning fontSize="small" color="warning" sx={{ ml: 1, verticalAlign: 'middle' }} />}
                    </TableCell>
                    <TableCell align="right">
                      <Typography fontWeight={row.is_outlier ? 600 : 400}>
                        {formatNumber(row.lead_count)}
                      </Typography>
                    </TableCell>
                    {normalizeOutliers && (
                      <TableCell align="right">
                        {row.is_outlier ? (
                          <Typography color="success.main" fontWeight={500}>
                            {formatNumber(row.normalized_value)}
                          </Typography>
                        ) : (
                          formatNumber(row.normalized_value)
                        )}
                      </TableCell>
                    )}
                    <TableCell align="right">{formatNumber(row.trend_value)}</TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={row.z_score?.toFixed(1) || '0'}
                        size="small"
                        color={Math.abs(row.z_score || 0) > 2 ? 'error' : Math.abs(row.z_score || 0) > 1 ? 'warning' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      {row.is_outlier ? (
                        <Chip 
                          label="Outlier" 
                          size="small" 
                          color="warning"
                          icon={<Warning />}
                        />
                      ) : row.residual > 0 ? (
                        <Chip label="Above Trend" size="small" color="success" />
                      ) : row.residual < 0 ? (
                        <Chip label="Below Trend" size="small" color="info" />
                      ) : (
                        <Chip label="On Trend" size="small" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Box>
    );
  };

  // Render content based on tab
  const renderContent = () => {
    if (loading) {
      return <LoadingState message="Loading lead data..." />;
    }
    
    if (error) {
      return (
        <Alert severity="error" sx={{ mb: 2 }}>
          Error loading data: {error}
          <ActionButton onClick={fetchData} sx={{ ml: 2 }}>Retry</ActionButton>
        </Alert>
      );
    }
    
    switch (activeTab) {
      case 'dashboard': return renderDashboard();
      case 'by-partner': return renderByPartner();
      case 'by-month': return renderByMonth();
      case 'by-region': return renderByRegion();
      case 'by-owner': return renderByOwner();
      case 'by-source': return renderBySource();
      case 'by-status': return renderByStatus();
      case 'trends': return renderTrends();
      case 'comparisons': return renderComparisons();
      case 'top-performers': return renderTopPerformers();
      case 'growth': return renderGrowthAnalysis();
      default: return <EmptyState message="Select a report" />;
    }
  };

  return (
    <Box className="lead-reports" sx={{ width: '100%' }}>
      <PageHeader
        title="Lead Reports"
        subtitle="Partner lead analytics and trends"
        icon={<Assessment />}
        onBack={onBack}
        actions={
          <ActionButton onClick={fetchData} startIcon={<Refresh />}>
            Refresh
          </ActionButton>
        }
      />

      <PageContent>
        {/* Tabs */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3, width: '100%' }}>
          <Tabs
            value={activeTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ width: '100%' }}
          >
            {TABS.map((tab) => (
              <Tab
                key={tab.id}
                value={tab.id}
                label={tab.label}
                icon={tab.icon}
                iconPosition="start"
              />
            ))}
          </Tabs>
        </Box>

        {/* Content */}
        <Box sx={{ width: '100%' }}>
          {renderContent()}
        </Box>
      </PageContent>
    </Box>
  );
}
