/**
 * Activity Timeline Report
 * Shows enrollment and certification activity over time with anomaly detection
 * Use case: Identify leading indicators for partner engagement
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Grid, Tabs, Tab, Alert, CircularProgress,
  Chip, Tooltip, IconButton, ToggleButton, ToggleButtonGroup, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Card, CardContent
} from '@mui/material';
import {
  TrendingUp, TrendingDown, TrendingFlat, Refresh, Download, Timeline as TimelineIcon,
  Warning, CheckCircle, School, EmojiEvents, ArrowBack, FilterList,
  Speed, Map, Person, Groups, Info, CalendarMonth, ShowChart,
  KeyboardArrowUp, KeyboardArrowDown, Remove
} from '@mui/icons-material';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ComposedChart, ReferenceLine
} from 'recharts';
import {
  PageHeader, PageContent, StatCard, StatsRow, ActionButton, FilterSelect, TierBadge, InfoButton
} from './ui/NintexUI';
import './ActivityTimeline.css';

const API_BASE = '/api/db/reports';

// Chart colors
const COLORS = {
  enrollments: '#FF6B35',    // Nintex orange
  completions: '#6B4C9A',    // Nintex purple
  certifications: '#28a745', // Green
  npcu: '#17a2b8',          // Teal
  anomaly: '#dc3545'        // Red
};

export default function ActivityTimeline({ onBack }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ tiers: [], regions: [], countries: [], owners: [], partners: [] });
  
  // Filter state
  const [partnerId, setPartnerId] = useState('');
  const [tier, setTier] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const [owner, setOwner] = useState('');
  const [months, setMonths] = useState(12);
  const [granularity, setGranularity] = useState('month');
  
  // Tab state
  const [activeTab, setActiveTab] = useState(0);
  
  // Chart options
  const [showRegionalTrends, setShowRegionalTrends] = useState(false);

  // Load filters
  useEffect(() => {
    async function loadFilters() {
      try {
        const res = await fetch(`${API_BASE}/filters`);
        if (res.ok) {
          setFilters(await res.json());
        }
      } catch (err) {
        console.error('Failed to load filters:', err);
      }
    }
    loadFilters();
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({ months, granularity });
      if (partnerId) params.set('partnerId', partnerId);
      if (tier) params.set('tier', tier);
      if (region) params.set('region', region);
      if (country) params.set('country', country);
      if (owner) params.set('owner', owner);
      
      const res = await fetch(`${API_BASE}/activity-timeline?${params}`);
      if (!res.ok) throw new Error('Failed to load activity data');
      
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [partnerId, tier, region, country, owner, months, granularity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Export to CSV
  const handleExport = () => {
    if (!data?.timeline) return;
    
    const headers = ['Period', 'Enrollments', 'Completions', 'Certifications', 'NPCU Earned', 'Enrollments Change %', 'Completions Change %'];
    const rows = data.timeline.map(p => [
      p.period,
      p.enrollments,
      p.completions,
      p.certifications,
      p.npcu_earned || 0,
      p.enrollments_pct ?? '',
      p.completions_pct ?? ''
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-timeline-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Change indicator
  const ChangeIndicator = ({ value, showPercent = true }) => {
    if (value === null || value === undefined) return <Remove sx={{ color: 'grey.400', fontSize: 16 }} />;
    
    const color = value > 0 ? 'success.main' : value < 0 ? 'error.main' : 'grey.500';
    const Icon = value > 0 ? KeyboardArrowUp : value < 0 ? KeyboardArrowDown : Remove;
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', color }}>
        <Icon sx={{ fontSize: 18 }} />
        {showPercent && <Typography variant="caption" sx={{ color }}>{Math.abs(value)}%</Typography>}
      </Box>
    );
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    
    return (
      <Paper sx={{ p: 1.5, boxShadow: 3 }}>
        <Typography variant="subtitle2" gutterBottom>{label}</Typography>
        {payload.map((entry, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: entry.color }} />
            <Typography variant="caption">
              {entry.name}: <strong>{entry.value?.toLocaleString()}</strong>
            </Typography>
          </Box>
        ))}
      </Paper>
    );
  };

  if (loading && !data) {
    return (
      <PageContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <PageHeader
        icon={<TimelineIcon />}
        title="Activity Timeline"
        subtitle="Track enrollment and certification activity over time to identify trends and leading indicators"
        backButton={onBack && <ActionButton icon={<ArrowBack />} onClick={onBack} variant="outlined">Back</ActionButton>}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <FilterList color="action" />
          <Typography variant="subtitle1" fontWeight={600}>Filters</Typography>
        </Box>
        
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <FilterSelect
            label="Partner"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
            options={filters.partners}
            sx={{ minWidth: 200 }}
          />
          
          <FilterSelect
            label="Tier"
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            options={filters.tiers}
            sx={{ minWidth: 140 }}
          />
          
          <FilterSelect
            label="Region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            options={filters.regions}
            sx={{ minWidth: 150 }}
          />

          <FilterSelect
            label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={filters.countries}
            sx={{ minWidth: 180 }}
          />
          
          <FilterSelect
            label="Owner"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            options={filters.owners}
            sx={{ minWidth: 180 }}
          />
          
          <Divider orientation="vertical" flexItem />
          
          <ToggleButtonGroup
            value={granularity}
            exclusive
            onChange={(e, v) => v && setGranularity(v)}
            size="small"
          >
            <ToggleButton value="month">Monthly</ToggleButton>
            <ToggleButton value="week">Weekly</ToggleButton>
          </ToggleButtonGroup>
          
          <FilterSelect
            label="Period"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            options={[
              { value: 6, label: '6 months' },
              { value: 12, label: '12 months' },
              { value: 18, label: '18 months' },
              { value: 24, label: '24 months' }
            ]}
            sx={{ minWidth: 130 }}
          />
          
          <Box sx={{ flexGrow: 1 }} />
          
          <ActionButton icon={<Refresh />} onClick={loadData} variant="outlined" loading={loading}>
            Refresh
          </ActionButton>
          
          <ActionButton icon={<Download />} onClick={handleExport} variant="outlined">
            Export
          </ActionButton>
        </Box>
      </Paper>

      {data && (
        <>
          {/* Summary Stats */}
          <StatsRow columns={5}>
            <StatCard
              icon={<School />}
              value={data.summary.totalEnrollments.toLocaleString()}
              label={<>
                Total Enrollments
                <Tooltip title={`Average: ${data.summary.avgEnrollments} per ${data.summary.dateLabel}`} arrow>
                  <IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}>
                    <Info sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>}
              variant="primary"
            />
            <StatCard
              icon={<CheckCircle />}
              value={data.summary.totalCompletions.toLocaleString()}
              label={<>
                Total Completions
                <Tooltip title={`Average: ${data.summary.avgCompletions} per ${data.summary.dateLabel}`} arrow>
                  <IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}>
                    <Info sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>}
              variant="primary"
            />
            <StatCard
              icon={<EmojiEvents />}
              value={data.summary.totalCertifications.toLocaleString()}
              label={<>
                Certifications
                <Tooltip title={`Average: ${data.summary.avgCertifications} per ${data.summary.dateLabel}`} arrow>
                  <IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}>
                    <Info sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>}
              variant="success"
            />
            <StatCard
              icon={<Speed />}
              value={data.summary.totalNpcu.toLocaleString()}
              label="NPCU Earned"
              variant="primary"
            />
            <StatCard
              icon={<Warning />}
              value={data.anomalies.length}
              label={<>
                Anomalies Detected
                <Tooltip title="Periods with activity significantly above or below average (>1.5 standard deviations)" arrow>
                  <IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}>
                    <Info sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>}
              variant={data.anomalies.length > 0 ? 'warning' : 'default'}
            />
          </StatsRow>

          {/* Tabs */}
          <Paper sx={{ mb: 3 }}>
            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Timeline Charts<InfoButton tooltip="Interactive charts showing enrollment and completion activity over time with trend analysis and anomaly detection." /></Box>} icon={<ShowChart />} iconPosition="start" />
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Partner Insights<InfoButton tooltip="Analyze individual partner performance including activity levels, completion rates, and engagement metrics." /></Box>} icon={<Groups />} iconPosition="start" />
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Regional Analysis<InfoButton tooltip="Compare activity and performance metrics across different geographic regions." /></Box>} icon={<Map />} iconPosition="start" />
              <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Data Table<InfoButton tooltip="Raw timeline data in tabular format for detailed analysis and export." /></Box>} icon={<TimelineIcon />} iconPosition="start" />
            </Tabs>

            <Box sx={{ p: 3 }}>
              {/* Timeline Charts Tab */}
              {activeTab === 0 && (
                <>
                  {/* Anomalies Alert - Above charts */}
                  {data.anomalies.length > 0 && (
                    <Alert severity="warning" icon={<Warning />} sx={{ mb: 3 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Anomalies Detected - Potential Leading Indicators
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                        {data.anomalies.map((a, i) => (
                          <Chip
                            key={i}
                            label={`${a.period}: ${a.direction === 'spike' ? '📈' : '📉'} ${a.type} ${a.direction}`}
                            size="small"
                            color={a.direction === 'spike' ? 'success' : 'error'}
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    </Alert>
                  )}

                  {/* Main Activity Chart - Full Width */}
                  <Box sx={{ mb: 4 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="h6">Enrollment & Completion Activity</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">Regional Trends</Typography>
                        <ToggleButtonGroup
                          value={showRegionalTrends ? 'on' : 'off'}
                          exclusive
                          onChange={(e, v) => v && setShowRegionalTrends(v === 'on')}
                          size="small"
                        >
                          <ToggleButton value="off" sx={{ py: 0.25, px: 1 }}>Off</ToggleButton>
                          <ToggleButton value="on" sx={{ py: 0.25, px: 1 }}>On</ToggleButton>
                        </ToggleButtonGroup>
                      </Box>
                    </Box>
                    <ResponsiveContainer width="100%" height={400}>
                      <ComposedChart data={data.timeline}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="enrollments" name="Enrollments" fill={COLORS.enrollments} opacity={0.8} />
                        <Bar yAxisId="left" dataKey="completions" name="Completions" fill={COLORS.completions} opacity={0.8} />
                        <Line yAxisId="right" type="monotone" dataKey="certifications" name="Certifications" stroke={COLORS.certifications} strokeWidth={2} dot={{ r: 4 }} />
                        {showRegionalTrends && (
                          <Line yAxisId="right" type="monotone" dataKey="cert_APAC" name="APAC" stroke="#e91e63" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line yAxisId="right" type="monotone" dataKey="cert_Americas" name="Americas" stroke="#2196f3" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line yAxisId="right" type="monotone" dataKey="cert_EMEA" name="EMEA" stroke="#ff9800" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line yAxisId="right" type="monotone" dataKey="cert_Emerging_Markets" name="Emerging Mkts" stroke="#9c27b0" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </Box>

                  {/* Certifications Chart - Full Width */}
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" gutterBottom>Certifications Earned</Typography>
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={data.timeline}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend />
                        <Area type="monotone" dataKey="certifications" name="Certifications" fill={COLORS.certifications} stroke={COLORS.certifications} fillOpacity={0.3} />
                        <Line type="linear" dataKey="certifications_trend" name="Trend" stroke="#666666" strokeWidth={2} strokeDasharray="8 4" dot={false} />
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="cert_APAC" name="APAC" stroke="#e91e63" strokeWidth={1.5} dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="cert_Americas" name="Americas" stroke="#2196f3" strokeWidth={1.5} dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="cert_EMEA" name="EMEA" stroke="#ff9800" strokeWidth={1.5} dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="cert_Emerging_Markets" name="Emerging Mkts" stroke="#9c27b0" strokeWidth={1.5} dot={false} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>

                  {/* NPCU Chart - Full Width */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="h6" gutterBottom>NPCU Earned Over Time</Typography>
                    <ResponsiveContainer width="100%" height={350}>
                      <AreaChart data={data.timeline}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend />
                        <Area type="monotone" dataKey="npcu_earned" name="NPCU Earned" fill={COLORS.npcu} stroke={COLORS.npcu} fillOpacity={0.3} />
                        <Line type="linear" dataKey="npcu_trend" name="Trend" stroke="#666666" strokeWidth={2} strokeDasharray="8 4" dot={false} />
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="npcu_APAC" name="APAC" stroke="#e91e63" strokeWidth={1.5} dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="npcu_Americas" name="Americas" stroke="#2196f3" strokeWidth={1.5} dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="npcu_EMEA" name="EMEA" stroke="#ff9800" strokeWidth={1.5} dot={false} />
                        )}
                        {showRegionalTrends && (
                          <Line type="monotone" dataKey="npcu_Emerging_Markets" name="Emerging Mkts" stroke="#9c27b0" strokeWidth={1.5} dot={false} />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </Box>
                </>
              )}

              {/* Partner Insights Tab */}
              {activeTab === 1 && (
                <Grid container spacing={3}>
                  {/* Declining Partners */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                          <TrendingDown color="error" />
                          <Typography variant="h6">Declining Activity</Typography>
                          <Tooltip title="Partners whose activity in recent periods dropped by 50%+ compared to earlier periods. May indicate disengagement - reach out to discuss." arrow>
                            <IconButton size="small"><Info sx={{ fontSize: 16 }} /></IconButton>
                          </Tooltip>
                        </Box>
                        
                        {data.insights.decliningPartners.length === 0 ? (
                          <Typography color="text.secondary">No declining partners detected</Typography>
                        ) : (
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Partner</TableCell>
                                  <TableCell>Tier</TableCell>
                                  <TableCell align="right">Completions</TableCell>
                                  <TableCell align="right">Last Active</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {data.insights.decliningPartners.map((p) => (
                                  <TableRow key={p.partner_id} hover>
                                    <TableCell>
                                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                        {p.account_name}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <TierBadge tier={p.partner_tier} />
                                    </TableCell>
                                    <TableCell align="right">{p.total_completions}</TableCell>
                                    <TableCell align="right">
                                      <Typography variant="caption" color="text.secondary">
                                        {p.last_active}
                                      </Typography>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Surging Partners */}
                  <Grid item xs={12} md={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                          <TrendingUp color="success" />
                          <Typography variant="h6">Surging Activity</Typography>
                          <Tooltip title="Partners whose activity increased by 50%+ in recent periods. Could indicate new projects, deals in pipeline, or tender activity." arrow>
                            <IconButton size="small"><Info sx={{ fontSize: 16 }} /></IconButton>
                          </Tooltip>
                        </Box>
                        
                        {data.insights.surgingPartners.length === 0 ? (
                          <Typography color="text.secondary">No surging partners detected</Typography>
                        ) : (
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Partner</TableCell>
                                  <TableCell>Tier</TableCell>
                                  <TableCell align="right">Completions</TableCell>
                                  <TableCell align="right">Certs</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {data.insights.surgingPartners.map((p) => (
                                  <TableRow key={p.partner_id} hover>
                                    <TableCell>
                                      <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                        {p.account_name}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <TierBadge tier={p.partner_tier} />
                                    </TableCell>
                                    <TableCell align="right">{p.total_completions}</TableCell>
                                    <TableCell align="right">{p.total_certifications}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        )}
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Action Items */}
                  <Grid item xs={12}>
                    <Alert severity="info" icon={<Info />}>
                      <Typography variant="subtitle2" gutterBottom>Recommended Actions</Typography>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        <li><strong>Declining Partners:</strong> Schedule check-in calls to understand if priorities have shifted. Offer enablement sessions or new training paths.</li>
                        <li><strong>Surging Partners:</strong> Reach out to discuss current projects. Ask about pipeline opportunities and ensure they have the resources they need.</li>
                        <li><strong>Regional Spikes:</strong> May indicate tender activity or market opportunity. Coordinate with field teams for follow-up.</li>
                      </ul>
                    </Alert>
                  </Grid>
                </Grid>
              )}

              {/* Regional Analysis Tab */}
              {activeTab === 2 && (
                <Grid container spacing={3}>
                  {/* Regional KPI Cards */}
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                      {data.insights.regionalSummary.slice(0, 5).map((r) => (
                        <Card key={r.region} variant="outlined" sx={{ flex: '1 1 180px', minWidth: 180 }}>
                          <CardContent sx={{ py: 1.5, px: 2 }}>
                            <Typography variant="caption" color="text.secondary">{r.region}</Typography>
                            <Typography variant="h5" fontWeight={600}>{r.certifications}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Certifications • {r.certificationRate}% rate
                            </Typography>
                          </CardContent>
                        </Card>
                      ))}
                    </Box>
                  </Grid>

                  {/* Main Bar Chart - Full Width */}
                  <Grid item xs={12}>
                    <Typography variant="h6" gutterBottom>Regional Activity Comparison (Per Partner Averages)</Typography>
                    <ResponsiveContainer width="100%" height={350}>
                      <BarChart 
                        data={data.insights.regionalSummary.map(r => ({
                          ...r,
                          avgCompletions: r.avgCompletionsPerPartner || 0,
                          avgCerts: r.avgCertsPerPartner || 0,
                          avgNpcu: r.avgNpcuPerPartner || 0
                        }))} 
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 12 }} />
                        <YAxis type="category" dataKey="region" tick={{ fontSize: 13 }} width={130} />
                        <RechartsTooltip 
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const regionData = data.insights.regionalSummary.find(r => r.region === label);
                            return (
                              <Paper sx={{ p: 1.5, minWidth: 200 }}>
                                <Typography variant="subtitle2" fontWeight={600}>{label}</Typography>
                                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                  {regionData?.partners || 0} partners
                                </Typography>
                                <Divider sx={{ my: 0.5 }} />
                                {payload.map((entry, i) => (
                                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.25 }}>
                                    <Typography variant="body2" sx={{ color: entry.color }}>
                                      {entry.name}:
                                    </Typography>
                                    <Typography variant="body2" fontWeight={500}>
                                      {entry.value?.toFixed(1)} avg
                                    </Typography>
                                  </Box>
                                ))}
                                <Divider sx={{ my: 0.5 }} />
                                <Typography variant="caption" color="text.secondary">
                                  Totals: {regionData?.completions?.toLocaleString() || 0} completions, {regionData?.certifications?.toLocaleString() || 0} certs, {regionData?.npcu?.toLocaleString() || 0} NPCU
                                </Typography>
                              </Paper>
                            );
                          }}
                        />
                        <Legend />
                        <Bar dataKey="avgCompletions" name="Completions/Partner" fill={COLORS.completions} barSize={20} />
                        <Bar dataKey="avgCerts" name="Certifications/Partner" fill={COLORS.certifications} barSize={20} />
                        <Bar dataKey="avgNpcu" name="NPCU/Partner" fill={COLORS.npcu} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Grid>

                  {/* Regional Metrics Table */}
                  <Grid item xs={12} lg={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom>Regional Performance Metrics</Typography>
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Region</TableCell>
                                <TableCell align="right">Partners</TableCell>
                                <TableCell align="right">Avg Certs/Partner</TableCell>
                                <TableCell align="right">Cert Rate</TableCell>
                                <TableCell align="right">NPCU</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {data.insights.regionalSummary.map((r) => (
                                <TableRow key={r.region} hover>
                                  <TableCell>
                                    <Chip label={r.region} size="small" variant="outlined" />
                                  </TableCell>
                                  <TableCell align="right">{r.partners}</TableCell>
                                  <TableCell align="right">
                                    <Typography 
                                      variant="body2" 
                                      color={r.avgCertsPerPartner >= 3 ? 'success.main' : r.avgCertsPerPartner >= 1 ? 'text.primary' : 'error.main'}
                                      fontWeight={500}
                                    >
                                      {r.avgCertsPerPartner}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="right">
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                                      <Box 
                                        sx={{ 
                                          width: 40, 
                                          height: 6, 
                                          bgcolor: 'grey.200', 
                                          borderRadius: 1,
                                          overflow: 'hidden'
                                        }}
                                      >
                                        <Box 
                                          sx={{ 
                                            width: `${Math.min(r.certificationRate, 100)}%`, 
                                            height: '100%', 
                                            bgcolor: r.certificationRate >= 15 ? 'success.main' : r.certificationRate >= 8 ? 'warning.main' : 'error.main'
                                          }} 
                                        />
                                      </Box>
                                      <Typography variant="caption">{r.certificationRate}%</Typography>
                                    </Box>
                                  </TableCell>
                                  <TableCell align="right">{r.npcu?.toLocaleString() || 0}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Top Partners by Region */}
                  <Grid item xs={12} lg={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom>Top Performers by Region</Typography>
                        <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                          {data.insights.regionalSummary.slice(0, 4).map((r) => (
                            <Box key={r.region} sx={{ mb: 2 }}>
                              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                                {r.region}
                              </Typography>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {(data.insights.topPartnersByRegion?.[r.region] || []).map((p, idx) => (
                                  <Chip
                                    key={p.partner_id}
                                    label={
                                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Typography variant="caption" sx={{ fontWeight: idx === 0 ? 600 : 400 }}>
                                          {p.account_name.length > 20 ? p.account_name.substring(0, 20) + '...' : p.account_name}
                                        </Typography>
                                        <Typography variant="caption" color="success.main" fontWeight={600}>
                                          ({p.total_certifications})
                                        </Typography>
                                      </Box>
                                    }
                                    size="small"
                                    variant={idx === 0 ? 'filled' : 'outlined'}
                                    color={idx === 0 ? 'success' : 'default'}
                                    sx={{ fontSize: '0.7rem' }}
                                  />
                                ))}
                                {(!data.insights.topPartnersByRegion?.[r.region] || data.insights.topPartnersByRegion[r.region].length === 0) && (
                                  <Typography variant="caption" color="text.secondary">No data</Typography>
                                )}
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Regional Efficiency Comparison */}
                  <Grid item xs={12}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="h6" gutterBottom>Certification Efficiency by Region</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          Average certifications and NPCU per partner - higher is better
                        </Typography>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={data.insights.regionalSummary.filter(r => r.region !== 'Unknown')}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="region" tick={{ fontSize: 12 }} />
                            <YAxis tick={{ fontSize: 12 }} />
                            <RechartsTooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar dataKey="avgCertsPerPartner" name="Avg Certs/Partner" fill={COLORS.certifications} />
                            <Bar dataKey="avgNpcuPerPartner" name="Avg NPCU/Partner" fill={COLORS.npcu} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  </Grid>

                  {/* Regional Insights */}
                  <Grid item xs={12}>
                    <Alert severity="info" icon={<Info />}>
                      <Typography variant="subtitle2" gutterBottom>Regional Insights</Typography>
                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {data.insights.regionalSummary.length > 0 && (
                          <>
                            <li><strong>Highest Volume:</strong> {data.insights.regionalSummary[0]?.region} leads with {data.insights.regionalSummary[0]?.certifications?.toLocaleString()} certifications from {data.insights.regionalSummary[0]?.partners} partners.</li>
                            <li><strong>Best Efficiency:</strong> {
                              [...data.insights.regionalSummary].filter(r => r.region !== 'Unknown').sort((a, b) => b.avgCertsPerPartner - a.avgCertsPerPartner)[0]?.region
                            } has the highest average certifications per partner ({
                              [...data.insights.regionalSummary].filter(r => r.region !== 'Unknown').sort((a, b) => b.avgCertsPerPartner - a.avgCertsPerPartner)[0]?.avgCertsPerPartner
                            }).</li>
                            <li><strong>Certification Rate:</strong> {
                              [...data.insights.regionalSummary].filter(r => r.region !== 'Unknown').sort((a, b) => b.certificationRate - a.certificationRate)[0]?.region
                            } converts the highest % of completions to certifications ({
                              [...data.insights.regionalSummary].filter(r => r.region !== 'Unknown').sort((a, b) => b.certificationRate - a.certificationRate)[0]?.certificationRate
                            }%).</li>
                          </>
                        )}
                      </ul>
                    </Alert>
                  </Grid>
                </Grid>
              )}

              {/* Data Table Tab */}
              {activeTab === 3 && (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Period</TableCell>
                        <TableCell align="right">Enrollments</TableCell>
                        <TableCell align="center">Change</TableCell>
                        <TableCell align="right">Completions</TableCell>
                        <TableCell align="center">Change</TableCell>
                        <TableCell align="right">Certifications</TableCell>
                        <TableCell align="center">Change</TableCell>
                        <TableCell align="right">NPCU</TableCell>
                        <TableCell align="right">Active Partners</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.timeline.map((p, i) => (
                        <TableRow 
                          key={p.period} 
                          hover
                          sx={{
                            bgcolor: (p.isAnomalyEnrollments || p.isAnomalyCompletions || p.isAnomalyCertifications) 
                              ? 'warning.lighter' : 'inherit'
                          }}
                        >
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>{p.period}</Typography>
                          </TableCell>
                          <TableCell align="right">{p.enrollments.toLocaleString()}</TableCell>
                          <TableCell align="center"><ChangeIndicator value={p.enrollments_pct} /></TableCell>
                          <TableCell align="right">{p.completions.toLocaleString()}</TableCell>
                          <TableCell align="center"><ChangeIndicator value={p.completions_pct} /></TableCell>
                          <TableCell align="right">{p.certifications.toLocaleString()}</TableCell>
                          <TableCell align="center"><ChangeIndicator value={p.certifications_pct} /></TableCell>
                          <TableCell align="right">{(p.npcu_earned || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">{p.partners_completing || p.partners_enrolling || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Paper>
        </>
      )}
    </PageContent>
  );
}
