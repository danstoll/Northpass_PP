import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  CircularProgress,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  ContentCopy,
  Download,
  Link as LinkIcon,
  OpenInNew,
  Search,
  CheckCircle,
  Warning,
  Person,
  Business,
  Refresh,
  SelectAll,
} from '@mui/icons-material';
import { PageHeader, PageContent, StatsRow, StatCard, ResultAlert } from './ui/NintexUI';
import './BulkUrlGenerator.css';

// Tier colors matching Nintex theme
const tierColors = {
  Premier: { bg: '#6B4C9A', text: '#fff' },
  Select: { bg: '#FF6B35', text: '#fff' },
  Registered: { bg: '#28a745', text: '#fff' },
  Certified: { bg: '#17a2b8', text: '#fff' },
  Aggregator: { bg: '#6c757d', text: '#fff' },
  default: { bg: '#e0e0e0', text: '#333' },
};

const getTierColor = (tier) => tierColors[tier] || tierColors.default;

// Encode partner parameters for URL
const encodePartnerUrl = (partner) => {
  const params = {
    company: partner.account_name,
    tier: partner.partner_tier || 'Registered',
    type: 'partner'
  };
  const jsonString = JSON.stringify(params);
  const encoded = btoa(jsonString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return encoded;
};

// Generate full URL
const generatePartnerUrl = (baseUrl, partner) => {
  const encoded = encodePartnerUrl(partner);
  return `${baseUrl}/?data=${encoded}`;
};

const BulkUrlGenerator = () => {
  // State
  const [owners, setOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [partners, setPartners] = useState([]);
  const [filteredPartners, setFilteredPartners] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [copyAllSuccess, setCopyAllSuccess] = useState(false);
  const [selectedPartners, setSelectedPartners] = useState(new Set());
  const [showOnlyWithGroups, setShowOnlyWithGroups] = useState(false);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  // Load account owners on mount
  useEffect(() => {
    loadOwners();
  }, []);

  // Filter partners when search term or filter changes
  useEffect(() => {
    let filtered = partners;
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.account_name.toLowerCase().includes(term) ||
        (p.partner_tier && p.partner_tier.toLowerCase().includes(term))
      );
    }
    
    if (showOnlyWithGroups) {
      filtered = filtered.filter(p => p.group_id);
    }
    
    setFilteredPartners(filtered);
  }, [partners, searchTerm, showOnlyWithGroups]);

  const loadOwners = async () => {
    setLoadingOwners(true);
    try {
      const response = await fetch('/api/db/partners/owners');
      if (!response.ok) throw new Error('Failed to load account owners');
      const data = await response.json();
      setOwners(data);
    } catch (err) {
      setError('Failed to load account owners: ' + err.message);
    } finally {
      setLoadingOwners(false);
    }
  };

  const loadPartnersByOwner = async (ownerName) => {
    setLoading(true);
    setError(null);
    setSelectedPartners(new Set());
    
    try {
      const response = await fetch(`/api/db/partners/by-owner/${encodeURIComponent(ownerName)}`);
      if (!response.ok) throw new Error('Failed to load partners');
      const data = await response.json();
      setPartners(data);
    } catch (err) {
      setError('Failed to load partners: ' + err.message);
      setPartners([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOwnerChange = (event) => {
    const owner = event.target.value;
    setSelectedOwner(owner);
    setSearchTerm('');
    if (owner) {
      loadPartnersByOwner(owner);
    } else {
      setPartners([]);
    }
  };

  const copyToClipboard = async (text, partnerId = null) => {
    try {
      await navigator.clipboard.writeText(text);
      if (partnerId) {
        setCopiedId(partnerId);
        setTimeout(() => setCopiedId(null), 2000);
      }
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  };

  const copyAllUrls = async () => {
    const partnersToCopy = selectedPartners.size > 0 
      ? filteredPartners.filter(p => selectedPartners.has(p.id))
      : filteredPartners;
    
    const urlLines = partnersToCopy.map(p => 
      `${p.account_name}\t${p.partner_tier || 'No Tier'}\t${generatePartnerUrl(baseUrl, p)}`
    );
    
    const header = 'Partner Name\tTier\tURL';
    const text = [header, ...urlLines].join('\n');
    
    const success = await copyToClipboard(text);
    if (success) {
      setCopyAllSuccess(true);
      setTimeout(() => setCopyAllSuccess(false), 3000);
    }
  };

  const downloadCsv = () => {
    const partnersToCopy = selectedPartners.size > 0 
      ? filteredPartners.filter(p => selectedPartners.has(p.id))
      : filteredPartners;
    
    const csvRows = [
      ['Partner Name', 'Tier', 'Region', 'Has LMS Group', 'Portal URL'].join(','),
      ...partnersToCopy.map(p => [
        `"${p.account_name.replace(/"/g, '""')}"`,
        p.partner_tier || '',
        p.account_region || '',
        p.group_id ? 'Yes' : 'No',
        generatePartnerUrl(baseUrl, p)
      ].join(','))
    ];
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `partner-urls-${selectedOwner.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePartnerSelection = (partnerId) => {
    const newSelection = new Set(selectedPartners);
    if (newSelection.has(partnerId)) {
      newSelection.delete(partnerId);
    } else {
      newSelection.add(partnerId);
    }
    setSelectedPartners(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedPartners.size === filteredPartners.length) {
      setSelectedPartners(new Set());
    } else {
      setSelectedPartners(new Set(filteredPartners.map(p => p.id)));
    }
  };

  // Stats
  const totalPartners = partners.length;
  const partnersWithGroups = partners.filter(p => p.group_id).length;
  const tierBreakdown = partners.reduce((acc, p) => {
    const tier = p.partner_tier || 'No Tier';
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bulk-url-generator">
      <PageHeader
        icon={<LinkIcon />}
        title="Bulk URL Generator"
        subtitle="Generate portal URLs for all partners managed by an Account Manager"
      />

      <PageContent>
        {/* Owner Selection */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Person sx={{ color: 'var(--nintex-purple)', fontSize: 28 }} />
              <FormControl sx={{ minWidth: 300, flex: 1, maxWidth: 400 }}>
                <InputLabel>Select Account Manager</InputLabel>
                <Select
                  value={selectedOwner}
                  onChange={handleOwnerChange}
                  label="Select Account Manager"
                  disabled={loadingOwners}
                >
                  <MenuItem value="">
                    <em>Choose an account manager...</em>
                  </MenuItem>
                  {owners.map((owner) => (
                    <MenuItem key={owner.owner_name} value={owner.owner_name}>
                      {owner.owner_name} ({owner.account_count} partners)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              
              <IconButton onClick={loadOwners} disabled={loadingOwners} title="Refresh owners list">
                <Refresh />
              </IconButton>
              
              {loadingOwners && <CircularProgress size={24} />}
            </Box>
          </CardContent>
        </Card>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Stats Row */}
        {selectedOwner && !loading && partners.length > 0 && (
          <StatsRow columns={4}>
            <StatCard
              icon={<Business />}
              label="Total Partners"
              value={totalPartners}
              variant="primary"
            />
            <StatCard
              icon={<CheckCircle />}
              label="With LMS Groups"
              value={partnersWithGroups}
              variant="success"
            />
            <StatCard
              icon={<Warning />}
              label="Without Groups"
              value={totalPartners - partnersWithGroups}
              variant={totalPartners - partnersWithGroups > 0 ? 'warning' : 'default'}
            />
            <StatCard
              icon={<LinkIcon />}
              label="URLs Ready"
              value={filteredPartners.length}
              variant="info"
            />
          </StatsRow>
        )}

        {/* Tier Breakdown */}
        {selectedOwner && !loading && partners.length > 0 && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Tier Breakdown
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {Object.entries(tierBreakdown).sort((a, b) => b[1] - a[1]).map(([tier, count]) => {
                  const colors = getTierColor(tier);
                  return (
                    <Chip
                      key={tier}
                      label={`${tier}: ${count}`}
                      sx={{ 
                        backgroundColor: colors.bg, 
                        color: colors.text,
                        fontWeight: 600 
                      }}
                    />
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
            <Typography sx={{ ml: 2 }}>Loading partners for {selectedOwner}...</Typography>
          </Box>
        )}

        {/* Partner Table */}
        {selectedOwner && !loading && partners.length > 0 && (
          <Card>
            <CardContent>
              {/* Toolbar */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <TextField
                  size="small"
                  placeholder="Search partners..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  sx={{ minWidth: 250 }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search />
                      </InputAdornment>
                    ),
                  }}
                />
                
                <FormControlLabel
                  control={
                    <Checkbox 
                      checked={showOnlyWithGroups} 
                      onChange={(e) => setShowOnlyWithGroups(e.target.checked)}
                    />
                  }
                  label="Only with LMS groups"
                />
                
                <Box sx={{ flex: 1 }} />
                
                <Typography variant="body2" color="text.secondary">
                  {selectedPartners.size > 0 
                    ? `${selectedPartners.size} selected`
                    : `${filteredPartners.length} partners`}
                </Typography>
                
                <Button
                  variant="outlined"
                  startIcon={<SelectAll />}
                  onClick={toggleSelectAll}
                  size="small"
                >
                  {selectedPartners.size === filteredPartners.length ? 'Deselect All' : 'Select All'}
                </Button>
                
                <Button
                  variant="contained"
                  startIcon={<ContentCopy />}
                  onClick={copyAllUrls}
                  color={copyAllSuccess ? 'success' : 'primary'}
                >
                  {copyAllSuccess ? 'Copied!' : 'Copy All URLs'}
                </Button>
                
                <Button
                  variant="outlined"
                  startIcon={<Download />}
                  onClick={downloadCsv}
                >
                  Download CSV
                </Button>
              </Box>

              {copyAllSuccess && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  Copied {selectedPartners.size > 0 ? selectedPartners.size : filteredPartners.length} partner URLs to clipboard!
                </Alert>
              )}

              {/* Table */}
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedPartners.size === filteredPartners.length && filteredPartners.length > 0}
                          indeterminate={selectedPartners.size > 0 && selectedPartners.size < filteredPartners.length}
                          onChange={toggleSelectAll}
                        />
                      </TableCell>
                      <TableCell><strong>Partner Name</strong></TableCell>
                      <TableCell><strong>Tier</strong></TableCell>
                      <TableCell><strong>Region</strong></TableCell>
                      <TableCell><strong>LMS Group</strong></TableCell>
                      <TableCell align="center"><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPartners.map((partner) => {
                      const url = generatePartnerUrl(baseUrl, partner);
                      const tierColor = getTierColor(partner.partner_tier);
                      const isCopied = copiedId === partner.id;
                      
                      return (
                        <TableRow 
                          key={partner.id}
                          hover
                          selected={selectedPartners.has(partner.id)}
                          sx={{ 
                            '&:hover': { backgroundColor: 'var(--admin-bg-hover)' },
                            backgroundColor: selectedPartners.has(partner.id) ? 'rgba(107, 76, 154, 0.08)' : 'inherit'
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedPartners.has(partner.id)}
                              onChange={() => togglePartnerSelection(partner.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={500}>
                              {partner.account_name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {partner.partner_tier ? (
                              <Chip
                                label={partner.partner_tier}
                                size="small"
                                sx={{ 
                                  backgroundColor: tierColor.bg, 
                                  color: tierColor.text,
                                  fontWeight: 500,
                                  fontSize: '0.75rem'
                                }}
                              />
                            ) : (
                              <Typography variant="body2" color="text.secondary">—</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {partner.account_region || '—'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {partner.group_id ? (
                              <Tooltip title={partner.group_name}>
                                <Chip
                                  icon={<CheckCircle sx={{ fontSize: 16 }} />}
                                  label="Linked"
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                />
                              </Tooltip>
                            ) : (
                              <Chip
                                icon={<Warning sx={{ fontSize: 16 }} />}
                                label="Not Linked"
                                size="small"
                                color="warning"
                                variant="outlined"
                              />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                              <Tooltip title={isCopied ? 'Copied!' : 'Copy URL'}>
                                <IconButton
                                  size="small"
                                  onClick={() => copyToClipboard(url, partner.id)}
                                  color={isCopied ? 'success' : 'default'}
                                >
                                  {isCopied ? <CheckCircle /> : <ContentCopy />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Open in new tab">
                                <IconButton
                                  size="small"
                                  onClick={() => window.open(url, '_blank')}
                                >
                                  <OpenInNew />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    
                    {filteredPartners.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">
                            {searchTerm || showOnlyWithGroups
                              ? 'No partners match your filters'
                              : 'No partners found'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!selectedOwner && !loadingOwners && (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <Person sx={{ fontSize: 64, color: 'var(--nintex-purple)', opacity: 0.5, mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Select an Account Manager
              </Typography>
              <Typography color="text.secondary">
                Choose an account manager from the dropdown above to see all their partners and generate portal URLs.
              </Typography>
            </CardContent>
          </Card>
        )}
      </PageContent>
    </div>
  );
};

export default BulkUrlGenerator;
