import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
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
} from './ui/NintexUI';
import './AccountOwnerReport.css';

const BASE_URL = 'https://ptrlrndb.prod.ntxgallery.com/';

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
      render: (val) => <span style={{ fontWeight: 500 }}>{val}</span>
    },
    { 
      id: 'partner_tier', 
      label: 'Tier',
      render: (val) => <TierBadge tier={val || 'Unknown'} />
    },
    { id: 'account_region', label: 'Region', render: (val) => val || 'N/A' },
    { id: 'contact_count', label: 'Contacts', align: 'center', render: (val) => parseInt(val, 10) || 0 },
    { id: 'contacts_in_lms', label: 'In LMS', align: 'center', render: (val) => parseInt(val, 10) || 0 },
    { 
      id: 'total_npcu', 
      label: 'NPCU', 
      align: 'center',
      render: (val) => (
        <span style={{ color: parseInt(val, 10) > 0 ? '#43E97B' : 'inherit', fontWeight: 600 }}>
          {parseInt(val, 10) || 0}
        </span>
      )
    },
    {
      id: 'actions',
      label: 'Dashboard',
      render: (_, row) => (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <ActionButton
            size="small"
            onClick={() => openDashboard(row)}
          >
            🔗 Open
          </ActionButton>
          <ActionButton
            size="small"
            variant="outlined"
            onClick={() => copyToClipboard(generateDashboardLink(row), row.account_name)}
          >
            {copiedLink === row.account_name ? '✓ Copied' : '📋 Copy'}
          </ActionButton>
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
            <StatCard icon="🏢" value={summaryStats.totalAccounts} label="Partners" variant="primary" />
            <StatCard icon="👥" value={summaryStats.totalContacts} label="Total Contacts" />
            <StatCard icon="📚" value={summaryStats.contactsInLms} label="In LMS" variant="success" />
            <StatCard icon="🏆" value={summaryStats.totalNpcu} label="Total NPCU" variant="primary" />
          </StatsRow>

          {/* Tier Stats */}
          {Object.keys(summaryStats.tierCounts).length > 0 && (
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
                    'Contacts': acc.contact_count || 0,
                    'In LMS': acc.contacts_in_lms || 0,
                    'NPCU': acc.total_npcu || 0,
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
                    contacts: acc.contact_count,
                    contactsInLms: acc.contacts_in_lms,
                    npcu: acc.total_npcu,
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
    </PageContent>
  );
}
