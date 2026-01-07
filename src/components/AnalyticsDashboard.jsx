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
  Divider
} from '@mui/material';
import {
  TrendingUp, TrendingDown, TrendingFlat, People, School, EmojiEvents,
  CalendarMonth, Refresh, Download, Timeline, Assessment, BarChart,
  ArrowUpward, ArrowDownward, Remove, FilterList, Clear, Speed,
  Groups, Map, Person, Warning, CheckCircle, Star, TrendingUp as Rocket
} from '@mui/icons-material';
import { PageHeader, PageContent, StatCard, StatsRow, ActionButton } from './ui/NintexUI';
import './AnalyticsDashboard.css';

const API_BASE = '/api/db';

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
function KpiCard({ title, icon, current, total, momChange, yoyChange }) {
  return (
    <Card className="kpi-card">
      <CardContent>
        <Box className="kpi-header">
          <Box className="kpi-icon">{icon}</Box>
          <Typography variant="subtitle2" color="textSecondary">{title}</Typography>
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
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [monthRange, setMonthRange] = useState(12);
  
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

  // Fetch all data with filters
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const filterParams = buildFilterParams();
    const filterSuffix = filterParams ? `&${filterParams}` : '';
    
    try {
      const [kpi, ytd, users, enrollments, certs, compliance, weekly,
             engagement, tierProg, segments, regional, owners] = await Promise.all([
        fetch(`${API_BASE}/trends/kpi-summary?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/ytd?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/users?months=${monthRange}${filterSuffix}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/enrollments?months=${monthRange}${filterSuffix}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/certifications?months=${monthRange}${filterSuffix}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/compliance?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/trends/weekly?weeks=12${filterSuffix}`).then(r => r.json()),
        // Deep Analytics
        fetch(`${API_BASE}/analytics/engagement-scores?limit=25${filterSuffix}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/tier-progression?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/user-segments?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/regional-comparison?${filterParams}`).then(r => r.json()),
        fetch(`${API_BASE}/analytics/owner-performance?${filterParams}`).then(r => r.json())
      ]);
      
      setKpiSummary(kpi);
      setYtdData(ytd);
      setUserTrends(users);
      setEnrollmentTrends(enrollments);
      setCertificationTrends(certs);
      setComplianceData(compliance);
      setWeeklySummary(weekly);
      
      // Deep Analytics
      setEngagementScores(engagement?.data || []);
      setTierProgression(tierProg?.data || null);
      setUserSegments(segments?.data || []);
      setRegionalComparison(regional?.data || []);
      setOwnerPerformance(owners?.data || []);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [monthRange, buildFilterParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
            onChange={(e, v) => setActiveTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider' }}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label="Monthly Trends" icon={<CalendarMonth />} iconPosition="start" />
            <Tab label="Weekly Activity" icon={<BarChart />} iconPosition="start" />
            <Tab label="Compliance" icon={<Assessment />} iconPosition="start" />
            <Tab label="Partner Engagement" icon={<Speed />} iconPosition="start" />
            <Tab label="Tier Progression" icon={<Rocket />} iconPosition="start" />
            <Tab label="User Segments" icon={<Groups />} iconPosition="start" />
            <Tab label="Regional" icon={<Map />} iconPosition="start" />
            <Tab label="Owner Performance" icon={<Person />} iconPosition="start" />
          </Tabs>

          {/* Monthly Trends Table */}
          {activeTab === 0 && (
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
          {activeTab === 1 && (
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
          {activeTab === 2 && (
            <Box sx={{ p: 3 }}>
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
          {activeTab === 3 && (
            <Box sx={{ p: 3 }}>
              <Grid container spacing={3}>
                {/* Top Engaged Partners */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Star color="warning" /> Top Engaged Partners
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Partner</TableCell>
                          <TableCell align="center">Score</TableCell>
                          <TableCell align="center">Activation</TableCell>
                          <TableCell align="center">Completion</TableCell>
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
                          <TableCell align="center">Score</TableCell>
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
          {activeTab === 4 && (
            <Box sx={{ p: 3 }}>
              <Grid container spacing={3}>
                {/* Close to Upgrade */}
                <Grid item xs={12} md={6}>
                  <Card variant="outlined" sx={{ borderColor: 'success.main' }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <CheckCircle color="success" /> Close to Upgrade ({tierProgression.closeToUpgrade?.length || 0})
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
                              <TableCell align="right">NPCU</TableCell>
                              <TableCell align="right">To Upgrade</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tierProgression.closeToUpgrade?.map((partner) => (
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
                        <Warning color="error" /> At Risk ({tierProgression.atRiskPartners?.length || 0})
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
                              <TableCell align="right">NPCU</TableCell>
                              <TableCell align="right">Required</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {tierProgression.atRiskPartners?.map((partner) => (
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
          {activeTab === 5 && (
            <Box sx={{ p: 3 }}>
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
          {activeTab === 6 && (
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
          {activeTab === 7 && (
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
