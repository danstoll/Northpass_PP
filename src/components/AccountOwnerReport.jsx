import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  IconButton,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PeopleIcon from '@mui/icons-material/People';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { generateEncodedUrl } from '../utils/urlEncoder';
import {
  PageHeader,
  PageContent,
  StatsRow,
  StatCard,
  SectionCard,
  SearchInput,
  FilterSelect,
  ActionButton,
  TierBadge,
  DataTable,
  LoadingState,
  EmptyState,
  StatusChip,
} from './ui/NintexUI';
import './AccountOwnerReport.css';

const BASE_URL = 'https://ptrlrndb.prod.ntxgallery.com/';
const SFDC_BASE_URL = 'https://nintex.lightning.force.com/lightning/r/Account/';
const IMPARTNER_BASE_URL = 'https://prod.impartner.live/en/accounts/addOrUpdate.aspx?id=';

// Metric definitions for info tooltips
const METRIC_DEFINITIONS = {
  partners: {
    title: 'Partners',
    description: 'Number of partner accounts assigned to this account owner.',
    details: ['Filtered by current search and filter criteria', 'Each partner may have multiple contacts']
  },
  totalContacts: {
    title: 'Total Contacts',
    description: 'Total number of contacts across all partners for this owner.',
    formula: 'Sum of contact_count for all displayed partners',
    details: ['Includes all contacts in CRM for these partners', 'Not all contacts may be registered in LMS']
  },
  inLms: {
    title: 'In LMS',
    description: 'Number of contacts who are registered in the Northpass LMS.',
    formula: 'Sum of contacts_in_lms for all displayed partners',
    details: ['Users actively registered in learning platform', 'Can access courses and certifications']
  },
  totalNpcu: {
    title: 'Total NPCU',
    description: 'Sum of all NPCU (Nintex Partner Certification Units) across all partners.',
    formula: 'Sum of total_npcu for all displayed partners',
    details: ['Only valid (non-expired) certifications count', 'Higher NPCU indicates more certified staff']
  },
  tierBreakdown: {
    title: 'Tier Breakdown',
    description: 'Count of partners by partner tier level.',
    details: [
      'Premier: Highest tier partners (20+ NPCU required)',
      'Select: Mid-tier partners (10+ NPCU required)',
      'Registered: Entry-level partners (5+ NPCU required)',
      'Certified: Partners with certifications'
    ]
  },
  contacts: {
    title: 'Contacts',
    description: 'Number of contacts in CRM for this partner.',
    details: ['All contacts associated with this partner account', 'Managed through Impartner CRM sync']
  },
  contactsInLms: {
    title: 'In LMS',
    description: 'Number of this partner\'s contacts registered in Northpass LMS.',
    details: ['Users who can access learning content', 'Comparison with Contacts shows LMS adoption rate']
  },
  partnerNpcu: {
    title: 'NPCU',
    description: 'Total NPCU earned by this partner\'s users.',
    formula: 'Sum of NPCU from valid certifications',
    details: ['Only non-expired certifications count', 'Determines partner tier qualification']
  },
  primaryUser: {
    title: 'Primary User',
    description: 'The designated primary contact for this partner account.',
    details: ['Set in Impartner CRM', 'Main point of contact for the partner', 'Synced automatically from Impartner']
  },
  crmLinks: {
    title: 'CRM Links',
    description: 'Quick links to the partner account in Salesforce and Impartner.',
    details: ['SFDC: Opens Salesforce Lightning account page', 'IMP: Opens Impartner company profile page']
  },
  dashboardLink: {
    title: 'Dashboard Link',
    description: 'Direct link to this partner\'s certification dashboard.',
    details: ['Opens partner-specific view showing their users', 'Can be shared with partner contacts', 'URL is encoded with company and tier']
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
        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
};

export default function AccountOwnerReport() {
  const [accountOwners, setAccountOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [copiedLink, setCopiedLink] = useState(null);
  const [orderBy, setOrderBy] = useState('account_name');
  const [order, setOrder] = useState('asc');

  // Partner Users Dialog state
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [usersDialogPartner, setUsersDialogPartner] = useState(null);
  const [partnerUsers, setPartnerUsers] = useState([]);
  const [partnerUsersSummary, setPartnerUsersSummary] = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState(null);

  // Load account owners from MariaDB on mount
  const loadAccountOwners = useCallback(async () => {
    setLoadingOwners(true);
    try {
      const response = await fetch('/api/db/reports/owners');
      if (response.ok) {
        const data = await response.json();
        setAccountOwners(data);
      } else {
        console.error('Failed to load owners');
      }
    } catch (error) {
      console.error('Error loading account owners:', error);
    } finally {
      setLoadingOwners(false);
    }
  }, []);

  // Load accounts for selected owner from MariaDB
  const loadAccountsForOwner = useCallback(async (ownerName) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/db/reports/owner-accounts?owner=${encodeURIComponent(ownerName)}`);
      if (response.ok) {
        const data = await response.json();
        setAccounts(data);
      } else {
        console.error('Failed to load accounts for owner');
        setAccounts([]);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccountOwners();
  }, [loadAccountOwners]);

  // Load users for a specific partner (for export dialog)
  const loadPartnerUsers = useCallback(async (partner) => {
    setUsersDialogPartner(partner);
    setUsersDialogOpen(true);
    setLoadingUsers(true);
    setUsersError(null);
    setPartnerUsers([]);
    setPartnerUsersSummary(null);

    try {
      const response = await fetch(`/api/db/reports/partner-users-export/${partner.id}`);
      if (response.ok) {
        const data = await response.json();
        setPartnerUsers(data.users || []);
        setPartnerUsersSummary(data.summary);
      } else {
        setUsersError('Failed to load users');
      }
    } catch (error) {
      console.error('Error loading partner users:', error);
      setUsersError(error.message);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Export users to CSV
  const exportUsersToCSV = useCallback(() => {
    if (!partnerUsers.length || !usersDialogPartner) return;

    const headers = ['Name', 'Email', 'Title', 'CRM Status', 'In LMS', 'LMS Status', 'NPCU Earned', 'Certifications'];
    const rows = partnerUsers.map(user => [
      user.full_name?.trim() || '',
      user.email || '',
      user.title || '',
      user.crm_status || '',
      user.in_lms ? 'Yes' : 'No',
      user.lms_status_display || '',
      user.npcu_earned || 0,
      user.certifications || 0
    ]);

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma or newline
        const str = String(cell);
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const filename = `${usersDialogPartner.account_name.replace(/[^a-z0-9]/gi, '_')}_Users_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [partnerUsers, usersDialogPartner]);

  // Close users dialog
  const closeUsersDialog = useCallback(() => {
    setUsersDialogOpen(false);
    setUsersDialogPartner(null);
    setPartnerUsers([]);
    setPartnerUsersSummary(null);
    setUsersError(null);
  }, []);

  // Load accounts when owner changes
  useEffect(() => {
    if (selectedOwner) {
      loadAccountsForOwner(selectedOwner);
    } else {
      setAccounts([]);
    }
  }, [selectedOwner, loadAccountsForOwner]);

  // Get unique tiers and regions for filters
  const { uniqueTiers, uniqueRegions } = useMemo(() => {
    const tiers = new Set();
    const regions = new Set();
    
    accounts.forEach(account => {
      if (account.partner_tier) tiers.add(account.partner_tier);
      if (account.account_region) regions.add(account.account_region);
    });
    
    return {
      uniqueTiers: Array.from(tiers).sort(),
      uniqueRegions: Array.from(regions).sort()
    };
  }, [accounts]);

  // Filter and sort accounts
  const filteredAccounts = useMemo(() => {
    let result = [...accounts];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(account =>
        (account.account_name || '').toLowerCase().includes(term) ||
        (account.partner_tier || '').toLowerCase().includes(term) ||
        (account.account_region || '').toLowerCase().includes(term)
      );
    }

    // Apply tier filter
    if (tierFilter) {
      result = result.filter(account => account.partner_tier === tierFilter);
    }

    // Apply region filter
    if (regionFilter) {
      result = result.filter(account => account.account_region === regionFilter);
    }

    // Sort by selected column
    result.sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];
      
      // Handle numeric columns
      if (['contact_count', 'contacts_in_lms', 'total_npcu'].includes(orderBy)) {
        aVal = parseInt(aVal, 10) || 0;
        bVal = parseInt(bVal, 10) || 0;
      } else {
        // String comparison
        aVal = (aVal || '').toString().toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
      }
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [accounts, searchTerm, tierFilter, regionFilter, orderBy, order]);

  // Handle sort click
  const handleSort = (columnId) => {
    if (orderBy === columnId) {
      // Toggle direction
      setOrder(order === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to asc
      setOrderBy(columnId);
      setOrder('asc');
    }
  };

  function generateDashboardLink(account) {
    // Use company name and tier to generate the encoded URL
    const params = {
      company: account.account_name,
      tier: account.partner_tier || 'Registered'
    };
    return generateEncodedUrl(BASE_URL, params);
  }

  async function copyToClipboard(link, accountName) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(accountName);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }

  function openDashboard(account) {
    const url = generateDashboardLink(account);
    window.open(url, '_blank');
  }

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const tierCounts = {};
    const regionCounts = {};
    let totalContacts = 0;
    let totalNpcu = 0;
    let contactsInLms = 0;

    filteredAccounts.forEach(account => {
      // Count by tier
      const tier = account.partner_tier || 'Unknown';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;

      // Count by region
      const region = account.account_region || 'Unknown';
      regionCounts[region] = (regionCounts[region] || 0) + 1;

      // Sum contacts and NPCU - ensure numeric conversion
      totalContacts += parseInt(account.contact_count, 10) || 0;
      totalNpcu += parseInt(account.total_npcu, 10) || 0;
      contactsInLms += parseInt(account.contacts_in_lms, 10) || 0;
    });

    return {
      totalAccounts: filteredAccounts.length,
      totalContacts,
      totalNpcu,
      contactsInLms,
      tierCounts,
      regionCounts
    };
  }, [filteredAccounts]);

  // Table columns for DataTable
  const tableColumns = [
    {
      id: 'account_name',
      label: 'Partner Name',
      render: (val, row) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <span style={{ fontWeight: 500 }}>{val}</span>
          {row.is_active === 0 && <StatusChip status="inactive" label="Inactive" />}
        </Box>
      )
    },
    { 
      id: 'partner_tier', 
      label: 'Tier',
      render: (val) => <TierBadge tier={val || 'Unknown'} />
    },
    { id: 'account_region', label: 'Region', render: (val) => val || 'N/A' },
    {
      id: 'primary_user',
      label: <Box sx={{ display: 'flex', alignItems: 'center' }}>Primary User<InfoTooltip metricKey="primaryUser" /></Box>,
      render: (_, row) => {
        if (!row.primary_user_name && !row.primary_user_email) {
          return <span style={{ color: '#999', fontStyle: 'italic' }}>Not set</span>;
        }
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            <span style={{ fontWeight: 500 }}>{row.primary_user_name || 'N/A'}</span>
            {row.primary_user_email && (
              <a 
                href={`mailto:${row.primary_user_email}`} 
                style={{ color: '#6B4C9A', fontSize: '0.85em', textDecoration: 'none' }}
                onClick={(e) => e.stopPropagation()}
              >
                {row.primary_user_email}
              </a>
            )}
          </Box>
        );
      }
    },
    { 
      id: 'contact_count', 
      label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Contacts<InfoTooltip metricKey="contacts" /></Box>, 
      align: 'center', 
      render: (val) => parseInt(val, 10) || 0 
    },
    { 
      id: 'contacts_in_lms', 
      label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>In LMS<InfoTooltip metricKey="contactsInLms" /></Box>, 
      align: 'center', 
      render: (val) => parseInt(val, 10) || 0 
    },
    { 
      id: 'total_npcu', 
      label: <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>NPCU<InfoTooltip metricKey="partnerNpcu" /></Box>, 
      align: 'center',
      render: (val) => (
        <span style={{ color: parseInt(val, 10) > 0 ? '#43E97B' : 'inherit', fontWeight: 600 }}>
          {parseInt(val, 10) || 0}
        </span>
      )
    },
    {
      id: 'crm_links',
      label: <Box sx={{ display: 'flex', alignItems: 'center' }}>CRM<InfoTooltip metricKey="crmLinks" /></Box>,
      align: 'center',
      render: (_, row) => (
        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
          {row.salesforce_id ? (
            <Tooltip title="Open in Salesforce">
              <a
                href={`${SFDC_BASE_URL}${row.salesforce_id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#00A1E0',
                  borderRadius: '4px',
                  textDecoration: 'none'
                }}
              >
                SFDC
              </a>
            </Tooltip>
          ) : (
            <span style={{ color: '#ccc', fontSize: '0.75rem' }}>—</span>
          )}
          {row.impartner_id ? (
            <Tooltip title="Open in Impartner">
              <a
                href={`${IMPARTNER_BASE_URL}${row.impartner_id}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#fff',
                  backgroundColor: '#FF6B35',
                  borderRadius: '4px',
                  textDecoration: 'none'
                }}
              >
                IMP
              </a>
            </Tooltip>
          ) : (
            <span style={{ color: '#ccc', fontSize: '0.75rem' }}>—</span>
          )}
        </Box>
      )
    },
    {
      id: 'actions',
      label: <Box sx={{ display: 'flex', alignItems: 'center' }}>Actions</Box>,
      render: (_, row) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="View all users for this partner">
            <ActionButton
              size="small"
              variant="outlined"
              onClick={() => loadPartnerUsers(row)}
            >
              <PeopleIcon sx={{ fontSize: 16, mr: 0.5 }} /> Users
            </ActionButton>
          </Tooltip>
          <Tooltip title="Open partner dashboard">
            <ActionButton
              size="small"
              onClick={() => openDashboard(row)}
            >
              🔗 Open
            </ActionButton>
          </Tooltip>
          <Tooltip title="Copy dashboard link">
            <ActionButton
              size="small"
              variant="outlined"
              onClick={() => copyToClipboard(generateDashboardLink(row), row.account_name)}
            >
              {copiedLink === row.account_name ? '✓ Copied' : '📋 Copy'}
            </ActionButton>
          </Tooltip>
        </Box>
      )
    },
  ];

  return (
    <PageContent>
      <PageHeader 
        icon="📊" 
        title="Account Owner Report" 
        subtitle="View partners by account owner with certification and NPCU details"
      />

      {/* Owner Selector */}
      <SectionCard title="Select Account Owner" icon="👤">
        <FormControl fullWidth size="small" disabled={loadingOwners}>
          <InputLabel>Account Owner</InputLabel>
          <Select
            value={selectedOwner}
            label="Account Owner"
            onChange={(e) => setSelectedOwner(e.target.value)}
          >
            <MenuItem value="">
              {loadingOwners ? 'Loading owners...' : '-- Select an Account Owner --'}
            </MenuItem>
            {accountOwners.map(owner => (
              <MenuItem key={owner.account_owner} value={owner.account_owner}>
                {owner.account_owner} ({owner.partner_count} partners)
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </SectionCard>

      {selectedOwner && (
        <>
          {/* Summary Stats */}
          <StatsRow columns={4}>
            <StatCard icon="🏢" value={summaryStats.totalAccounts} label={<>Partners <InfoTooltip metricKey="partners" /></>} variant="primary" />
            <StatCard icon="👥" value={summaryStats.totalContacts} label={<>Total Contacts <InfoTooltip metricKey="totalContacts" /></>} />
            <StatCard icon="📚" value={summaryStats.contactsInLms} label={<>In LMS <InfoTooltip metricKey="inLms" /></>} variant="success" />
            <StatCard icon="🏆" value={summaryStats.totalNpcu} label={<>Total NPCU <InfoTooltip metricKey="totalNpcu" /></>} variant="primary" />
          </StatsRow>

          {/* Tier Stats */}
          {Object.keys(summaryStats.tierCounts).length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, pl: 1 }}>
                <Typography variant="subtitle2" sx={{ color: 'text.secondary' }}>Tier Breakdown</Typography>
                <InfoTooltip metricKey="tierBreakdown" />
              </Box>
              <StatsRow columns={Object.keys(summaryStats.tierCounts).length}>
                {Object.entries(summaryStats.tierCounts).map(([tier, count]) => (
                  <StatCard 
                    key={tier} 
                    value={count} 
                    label={tier}
                    variant={tier.toLowerCase() === 'premier' ? 'primary' : 'default'}
                  />
                ))}
              </StatsRow>
            </Box>
          )}

          {/* Filters */}
          <SectionCard title="Filters" icon="🔍">
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <SearchInput
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClear={() => setSearchTerm('')}
                placeholder="Search partners..."
                fullWidth={false}
                sx={{ minWidth: 250 }}
              />
              <FilterSelect
                label="Tier"
                value={tierFilter}
                onChange={setTierFilter}
                options={uniqueTiers.map(t => ({ value: t, label: t }))}
                minWidth={150}
              />
              <FilterSelect
                label="Region"
                value={regionFilter}
                onChange={setRegionFilter}
                options={uniqueRegions.map(r => ({ value: r, label: r }))}
                minWidth={180}
              />
              {(searchTerm || tierFilter || regionFilter) && (
                <ActionButton
                  variant="outlined"
                  size="small"
                  onClick={() => {
                    setSearchTerm('');
                    setTierFilter('');
                    setRegionFilter('');
                  }}
                >
                  Clear Filters
                </ActionButton>
              )}
            </Box>
          </SectionCard>

          {/* Partners Table */}
          <SectionCard title="Partners" icon="📋" noPadding>
            {loading ? (
              <LoadingState message="Loading partners..." />
            ) : (
              <DataTable
                columns={tableColumns}
                data={filteredAccounts}
                emptyMessage="No partners found matching your criteria"
                sortable={true}
                orderBy={orderBy}
                order={order}
                onSort={handleSort}
              />
            )}
          </SectionCard>

          {/* Export Section */}
          <SectionCard title="Export Options" icon="📥">
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <ActionButton
                onClick={() => {
                  const data = filteredAccounts.map(acc => ({
                    'Partner Name': acc.account_name,
                    'Tier': acc.partner_tier || 'N/A',
                    'Region': acc.account_region || 'N/A',
                    'Primary User': acc.primary_user_name || 'N/A',
                    'Primary Email': acc.primary_user_email || 'N/A',
                    'Contacts': acc.contact_count || 0,
                    'In LMS': acc.contacts_in_lms || 0,
                    'NPCU': acc.total_npcu || 0,
                    'Salesforce URL': acc.salesforce_id ? `${SFDC_BASE_URL}${acc.salesforce_id}/view` : 'N/A',
                    'Impartner URL': acc.impartner_id ? `${IMPARTNER_BASE_URL}${acc.impartner_id}` : 'N/A',
                    'Dashboard URL': generateDashboardLink(acc)
                  }));
                  
                  const csv = [
                    Object.keys(data[0] || {}).join(','),
                    ...data.map(row => Object.values(row).map(v => `"${v}"`).join(','))
                  ].join('\n');
                  
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedOwner.replace(/[^a-z0-9]/gi, '_')}_partners.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={filteredAccounts.length === 0}
              >
                📥 Export to CSV
              </ActionButton>
              
              <ActionButton
                variant="outlined"
                onClick={() => {
                  const data = filteredAccounts.map(acc => ({
                    partnerName: acc.account_name,
                    tier: acc.partner_tier,
                    region: acc.account_region,
                    primaryUserName: acc.primary_user_name,
                    primaryUserEmail: acc.primary_user_email,
                    contacts: acc.contact_count,
                    contactsInLms: acc.contacts_in_lms,
                    npcu: acc.total_npcu,
                    salesforceUrl: acc.salesforce_id ? `${SFDC_BASE_URL}${acc.salesforce_id}/view` : null,
                    impartnerUrl: acc.impartner_id ? `${IMPARTNER_BASE_URL}${acc.impartner_id}` : null,
                    dashboardUrl: generateDashboardLink(acc)
                  }));
                  
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedOwner.replace(/[^a-z0-9]/gi, '_')}_partners.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={filteredAccounts.length === 0}
              >
                📄 Export to JSON
              </ActionButton>

              <ActionButton
                variant="outlined"
                onClick={async () => {
                  const links = filteredAccounts.map(acc => 
                    `${acc.account_name}\t${acc.partner_tier || 'N/A'}\t${acc.total_npcu || 0} NPCU\t${generateDashboardLink(acc)}`
                  ).join('\n');
                  
                  try {
                    await navigator.clipboard.writeText(links);
                    alert(`Copied ${filteredAccounts.length} partner links to clipboard!`);
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
                disabled={filteredAccounts.length === 0}
              >
                📋 Copy All Links
              </ActionButton>
            </Box>
          </SectionCard>
        </>
      )}

      {!selectedOwner && !loadingOwners && accountOwners.length > 0 && (
        <EmptyState
          icon="👋"
          title="Select an Account Owner"
          message={`Choose an account owner from the dropdown above to view their assigned partners. ${accountOwners.length} account owners found with ${accountOwners.reduce((sum, o) => sum + (o.partner_count || 0), 0)} total partners.`}
        />
      )}

      {!loadingOwners && accountOwners.length === 0 && (
        <EmptyState
          icon="⚠️"
          title="No Data Available"
          message="No account owners found in the database. Please import partner data first using the Data Import feature."
        />
      )}

      {/* Partner Users Dialog */}
      <Dialog
        open={usersDialogOpen}
        onClose={closeUsersDialog}
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { minHeight: '60vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PeopleIcon color="primary" />
            <Typography variant="h6">
              Users - {usersDialogPartner?.account_name}
            </Typography>
            {usersDialogPartner?.partner_tier && (
              <Chip label={usersDialogPartner.partner_tier} size="small" color="primary" variant="outlined" />
            )}
          </Box>
          <IconButton onClick={closeUsersDialog} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {loadingUsers && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 6 }}>
              <CircularProgress />
            </Box>
          )}

          {usersError && (
            <Alert severity="error" sx={{ mb: 2 }}>{usersError}</Alert>
          )}

          {!loadingUsers && partnerUsersSummary && (
            <>
              {/* Summary Stats */}
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                <Chip
                  label={`Total: ${partnerUsersSummary.total}`}
                  color="default"
                  variant="outlined"
                />
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`CRM Active: ${partnerUsersSummary.crmActive}`}
                  color="success"
                  variant="outlined"
                />
                <Chip
                  icon={<CancelIcon />}
                  label={`CRM Inactive: ${partnerUsersSummary.crmInactive}`}
                  color="error"
                  variant="outlined"
                />
                <Chip
                  label={`In LMS: ${partnerUsersSummary.inLms}`}
                  color="info"
                  variant="outlined"
                />
                <Chip
                  label={`Not in LMS: ${partnerUsersSummary.notInLms}`}
                  color="warning"
                  variant="outlined"
                />
              </Box>

              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2">
                  Export this list to CSV and share with the partner for review. They can identify users who are no longer with the company for offboarding.
                </Typography>
              </Alert>

              {/* Users Table */}
              <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Title</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>CRM Status</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>LMS Status</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>NPCU</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 600 }}>Certs</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {partnerUsers.map((user, idx) => (
                      <TableRow key={user.contact_id || idx} hover>
                        <TableCell>{user.full_name?.trim() || '-'}</TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                            {user.email}
                          </Typography>
                        </TableCell>
                        <TableCell>{user.title || '-'}</TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={user.crm_status}
                            color={user.crm_active ? 'success' : 'error'}
                            variant="outlined"
                            sx={{ minWidth: 70 }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Chip
                            size="small"
                            label={user.lms_status_display}
                            color={
                              !user.in_lms ? 'default' :
                              user.lms_active ? 'success' : 'error'
                            }
                            variant="outlined"
                            sx={{ minWidth: 90 }}
                          />
                        </TableCell>
                        <TableCell align="center">
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: user.npcu_earned > 0 ? 600 : 400,
                              color: user.npcu_earned > 0 ? 'success.main' : 'text.secondary'
                            }}
                          >
                            {user.npcu_earned || 0}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          {user.certifications || 0}
                        </TableCell>
                      </TableRow>
                    ))}
                    {partnerUsers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          No users found for this partner
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeUsersDialog} color="inherit">
            Close
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={exportUsersToCSV}
            disabled={partnerUsers.length === 0}
          >
            Export to CSV ({partnerUsers.length} users)
          </Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
}
