import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  Visibility as ViewsIcon,
  Business as PartnerIcon,
  TrendingUp as TrendingIcon,
  Public as RegionIcon,
  Person as PersonIcon,
  SupervisorAccount as NintexIcon
} from '@mui/icons-material';
import {
  PageHeader,
  PageContent,
  StatsRow,
  StatCard,
  SectionCard,
  TierBadge
} from './ui/NintexUI';

const WidgetAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState(null);
  const [regionData, setRegionData] = useState([]);
  const [tierData, setTierData] = useState([]);

  useEffect(() => {
    fetchAnalytics();
  }, [days]);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, regionRes, tierRes] = await Promise.all([
        fetch(`/api/track/summary?days=${days}&pageType=widget`),
        fetch(`/api/track/by-region?days=${days}&pageType=widget`),
        fetch(`/api/track/by-tier?days=${days}&pageType=widget`)
      ]);

      if (!summaryRes.ok) throw new Error('Failed to fetch analytics');

      const [summaryData, regionResults, tierResults] = await Promise.all([
        summaryRes.json(),
        regionRes.json(),
        tierRes.json()
      ]);

      setSummary(summaryData);
      setRegionData(regionResults);
      setTierData(tierResults);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return (
    <>
      <PageHeader
        title="Partner Training Dashboard Analytics"
        subtitle="Track partner engagement with the certification dashboard"
      />

      <PageContent>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Time Period</InputLabel>
            <Select
              value={days}
              label="Time Period"
              onChange={(e) => setDays(e.target.value)}
            >
              <MenuItem value={7}>Last 7 days</MenuItem>
              <MenuItem value={30}>Last 30 days</MenuItem>
              <MenuItem value={90}>Last 90 days</MenuItem>
              <MenuItem value={365}>Last year</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <StatsRow>
          <StatCard
            icon={<ViewsIcon />}
            value={summary?.totalViews?.toLocaleString() || '0'}
            label="Total Views"
            variant="primary"
          />
          <StatCard
            icon={<PartnerIcon />}
            value={summary?.uniquePartners?.toLocaleString() || '0'}
            label="Unique Partners"
            variant="success"
          />
          <StatCard
            icon={<TrendingIcon />}
            value={summary?.dailyViews?.length > 0
              ? Math.round(summary.totalViews / summary.dailyViews.length)
              : 0}
            label="Avg Views/Day"
            variant="info"
          />
        </StatsRow>

        {/* Viewer Type Breakdown */}
        <StatsRow columns={3}>
          <StatCard
            icon={<NintexIcon />}
            value={summary?.viewsByType?.nintex?.toLocaleString() || '0'}
            label="Nintex Staff Views"
            variant="info"
            subtitle={summary?.totalViews > 0
              ? `${((summary.viewsByType?.nintex || 0) / summary.totalViews * 100).toFixed(1)}% of total`
              : null}
          />
          <StatCard
            icon={<PersonIcon />}
            value={summary?.viewsByType?.partner?.toLocaleString() || '0'}
            label="Partner Views"
            variant="success"
            subtitle={summary?.totalViews > 0
              ? `${((summary.viewsByType?.partner || 0) / summary.totalViews * 100).toFixed(1)}% of total`
              : null}
          />
          <StatCard
            icon={<ViewsIcon />}
            value={summary?.viewsByType?.unknown?.toLocaleString() || '0'}
            label="Unidentified Views"
            variant="default"
            subtitle="Views before tracking was enabled"
          />
        </StatsRow>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mt: 3 }}>
          {/* Views by Region */}
          <SectionCard title="Views by Region" icon={<RegionIcon />}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Region</TableCell>
                    <TableCell align="right">Views</TableCell>
                    <TableCell align="right">Partners</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {regionData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{row.region}</TableCell>
                      <TableCell align="right">{row.views.toLocaleString()}</TableCell>
                      <TableCell align="right">{row.unique_partners}</TableCell>
                    </TableRow>
                  ))}
                  {regionData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>
                        No data yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>

          {/* Views by Tier */}
          <SectionCard title="Views by Tier" icon={<TrendingIcon />}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Tier</TableCell>
                    <TableCell align="right">Views</TableCell>
                    <TableCell align="right">Partners</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tierData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <TierBadge tier={row.tier} size="small" />
                      </TableCell>
                      <TableCell align="right">{row.views.toLocaleString()}</TableCell>
                      <TableCell align="right">{row.unique_partners}</TableCell>
                    </TableRow>
                  ))}
                  {tierData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} align="center" sx={{ color: 'text.secondary' }}>
                        No data yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </SectionCard>
        </Box>

        {/* Top Partners */}
        <SectionCard title="Top Partners by Views" icon={<PartnerIcon />} sx={{ mt: 3 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Partner</TableCell>
                  <TableCell>Tier</TableCell>
                  <TableCell>Region</TableCell>
                  <TableCell align="right">Views</TableCell>
                  <TableCell align="right">Days Active</TableCell>
                  <TableCell>Last Viewed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summary?.topPartners?.map((partner) => (
                  <TableRow key={partner.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {partner.account_name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <TierBadge tier={partner.partner_tier} size="small" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {partner.account_region || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        label={partner.views}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">{partner.days_active}</TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDateTime(partner.last_viewed)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {(!summary?.topPartners || summary.topPartners.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                      No partner views recorded yet. Views will appear here when partners open their certification dashboards.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>

        {/* Daily Views Chart (simple text version) */}
        {summary?.dailyViews?.length > 0 && (
          <SectionCard title="Daily Views" icon={<TrendingIcon />} sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2 }}>
              {summary.dailyViews.slice(0, 14).reverse().map((day, idx) => (
                <Box
                  key={idx}
                  sx={{
                    textAlign: 'center',
                    p: 1,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    minWidth: 60
                  }}
                >
                  <Typography variant="h6" color="primary">
                    {day.views}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatDate(day.date)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </SectionCard>
        )}
      </PageContent>
    </>
  );
};

export default WidgetAnalytics;
