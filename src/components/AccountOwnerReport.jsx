import { useState, useEffect, useMemo } from 'react';
import partnerDatabase from '../services/partnerDatabase';
import { generateEncodedUrl } from '../utils/urlEncoder';
import './AccountOwnerReport.css';

const BASE_URL = 'http://20.125.24.28:3000/';

export default function AccountOwnerReport() {
  const [accountOwners, setAccountOwners] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('accountName');
  const [sortDirection, setSortDirection] = useState('asc');
  const [tierFilter, setTierFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [copiedLink, setCopiedLink] = useState(null);

  // Load account owners on mount
  useEffect(() => {
    loadAccountOwners();
  }, []);

  // Load accounts when owner changes
  useEffect(() => {
    if (selectedOwner) {
      loadAccountsForOwner(selectedOwner);
    } else {
      setAccounts([]);
    }
  }, [selectedOwner]);

  async function loadAccountOwners() {
    setLoadingOwners(true);
    try {
      const owners = await partnerDatabase.getAccountOwners();
      setAccountOwners(owners);
    } catch (error) {
      console.error('Error loading account owners:', error);
    } finally {
      setLoadingOwners(false);
    }
  }

  async function loadAccountsForOwner(ownerName) {
    setLoading(true);
    try {
      const ownerAccounts = await partnerDatabase.getAccountsByOwner(ownerName);
      setAccounts(ownerAccounts);
    } catch (error) {
      console.error('Error loading accounts:', error);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }

  // Get unique tiers and regions for filters
  const { uniqueTiers, uniqueRegions } = useMemo(() => {
    const tiers = new Set();
    const regions = new Set();
    
    accounts.forEach(account => {
      if (account.tier) tiers.add(account.tier);
      if (account.region) regions.add(account.region);
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
        account.accountName.toLowerCase().includes(term) ||
        (account.tier && account.tier.toLowerCase().includes(term)) ||
        (account.region && account.region.toLowerCase().includes(term))
      );
    }

    // Apply tier filter
    if (tierFilter !== 'all') {
      result = result.filter(account => account.tier === tierFilter);
    }

    // Apply region filter
    if (regionFilter !== 'all') {
      result = result.filter(account => account.region === regionFilter);
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';

      if (sortField === 'contactCount') {
        aVal = Number(aVal) || 0;
        bVal = Number(bVal) || 0;
      } else {
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [accounts, searchTerm, tierFilter, regionFilter, sortField, sortDirection]);

  function handleSort(field) {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }

  function generateDashboardLink(account) {
    // Use company name and tier to generate the encoded URL
    const params = {
      company: account.accountName,
      tier: account.tier || 'Registered'
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

  function getSortIcon(field) {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '↑' : '↓';
  }

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const tierCounts = {};
    const regionCounts = {};
    let totalContacts = 0;

    filteredAccounts.forEach(account => {
      // Count by tier
      const tier = account.tier || 'Unknown';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;

      // Count by region
      const region = account.region || 'Unknown';
      regionCounts[region] = (regionCounts[region] || 0) + 1;

      // Sum contacts
      totalContacts += account.contactCount || 0;
    });

    return {
      totalAccounts: filteredAccounts.length,
      totalContacts,
      tierCounts,
      regionCounts
    };
  }, [filteredAccounts]);

  return (
    <div className="account-owner-report">
      <div className="report-header">
        <h2>📊 Account Owner Report</h2>
        <p className="report-description">
          View accounts by owner and access partner dashboards
        </p>
      </div>

      <div className="owner-selector-section">
        <label htmlFor="owner-select">Select Account Owner:</label>
        <select
          id="owner-select"
          value={selectedOwner}
          onChange={(e) => setSelectedOwner(e.target.value)}
          disabled={loadingOwners}
          className="owner-select"
        >
          <option value="">
            {loadingOwners ? 'Loading owners...' : '-- Select an Account Owner --'}
          </option>
          {accountOwners.map(owner => (
            <option key={owner.ownerName} value={owner.ownerName}>
              {owner.ownerName} ({owner.accountCount} accounts)
            </option>
          ))}
        </select>
      </div>

      {selectedOwner && (
        <>
          {/* Summary Stats */}
          <div className="summary-stats">
            <div className="stat-card">
              <span className="stat-value">{summaryStats.totalAccounts}</span>
              <span className="stat-label">Accounts</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{summaryStats.totalContacts}</span>
              <span className="stat-label">Total Contacts</span>
            </div>
            {Object.entries(summaryStats.tierCounts).map(([tier, count]) => (
              <div key={tier} className={`stat-card tier-${tier.toLowerCase()}`}>
                <span className="stat-value">{count}</span>
                <span className="stat-label">{tier}</span>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="filters-section">
            <div className="filter-group">
              <label>Search:</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search accounts..."
                className="search-input"
              />
            </div>

            <div className="filter-group">
              <label>Tier:</label>
              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Tiers</option>
                {uniqueTiers.map(tier => (
                  <option key={tier} value={tier}>{tier}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Region:</label>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
                className="filter-select"
              >
                <option value="all">All Regions</option>
                {uniqueRegions.map(region => (
                  <option key={region} value={region}>{region}</option>
                ))}
              </select>
            </div>

            {(searchTerm || tierFilter !== 'all' || regionFilter !== 'all') && (
              <button
                className="clear-filters-btn"
                onClick={() => {
                  setSearchTerm('');
                  setTierFilter('all');
                  setRegionFilter('all');
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          {/* Accounts Table */}
          {loading ? (
            <div className="loading-message">
              <span className="spinner">⏳</span> Loading accounts...
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="no-results">
              No accounts found matching your criteria.
            </div>
          ) : (
            <div className="accounts-table-container">
              <table className="accounts-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('accountName')} className="sortable">
                      Account Name {getSortIcon('accountName')}
                    </th>
                    <th onClick={() => handleSort('tier')} className="sortable">
                      Tier {getSortIcon('tier')}
                    </th>
                    <th onClick={() => handleSort('region')} className="sortable">
                      Region {getSortIcon('region')}
                    </th>
                    <th onClick={() => handleSort('contactCount')} className="sortable">
                      Contacts {getSortIcon('contactCount')}
                    </th>
                    <th>Dashboard</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAccounts.map((account, index) => (
                    <tr key={`${account.accountName}-${index}`}>
                      <td className="account-name-cell">
                        <span className="account-name">{account.accountName}</span>
                      </td>
                      <td>
                        <span className={`tier-badge tier-${(account.tier || 'unknown').toLowerCase()}`}>
                          {account.tier || 'N/A'}
                        </span>
                      </td>
                      <td>{account.region || 'N/A'}</td>
                      <td className="contact-count">{account.contactCount}</td>
                      <td className="actions-cell">
                        <div className="action-buttons">
                          <button
                            className="open-btn"
                            onClick={() => openDashboard(account)}
                            title="Open Dashboard"
                          >
                            🔗 Open
                          </button>
                          <button
                            className={`copy-btn ${copiedLink === account.accountName ? 'copied' : ''}`}
                            onClick={() => copyToClipboard(generateDashboardLink(account), account.accountName)}
                            title="Copy Link"
                          >
                            {copiedLink === account.accountName ? '✓ Copied' : '📋 Copy'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Export Section */}
          <div className="export-section">
            <h3>Export Options</h3>
            <div className="export-buttons">
              <button
                className="export-btn"
                onClick={() => {
                  const data = filteredAccounts.map(acc => ({
                    'Account Name': acc.accountName,
                    'Tier': acc.tier || 'N/A',
                    'Region': acc.region || 'N/A',
                    'Contacts': acc.contactCount,
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
                  a.download = `${selectedOwner.replace(/[^a-z0-9]/gi, '_')}_accounts.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={filteredAccounts.length === 0}
              >
                📥 Export to CSV
              </button>
              
              <button
                className="export-btn"
                onClick={() => {
                  const data = filteredAccounts.map(acc => ({
                    accountName: acc.accountName,
                    tier: acc.tier,
                    region: acc.region,
                    contacts: acc.contactCount,
                    dashboardUrl: generateDashboardLink(acc)
                  }));
                  
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${selectedOwner.replace(/[^a-z0-9]/gi, '_')}_accounts.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={filteredAccounts.length === 0}
              >
                📄 Export to JSON
              </button>

              <button
                className="export-btn copy-all-btn"
                onClick={async () => {
                  const links = filteredAccounts.map(acc => 
                    `${acc.accountName}\t${acc.tier || 'N/A'}\t${generateDashboardLink(acc)}`
                  ).join('\n');
                  
                  try {
                    await navigator.clipboard.writeText(links);
                    alert(`Copied ${filteredAccounts.length} account links to clipboard!`);
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
                disabled={filteredAccounts.length === 0}
              >
                📋 Copy All Links
              </button>
            </div>
          </div>
        </>
      )}

      {!selectedOwner && !loadingOwners && accountOwners.length > 0 && (
        <div className="welcome-message">
          <div className="welcome-icon">👋</div>
          <h3>Select an Account Owner</h3>
          <p>
            Choose an account owner from the dropdown above to view their assigned accounts
            and access partner dashboard links.
          </p>
          <div className="owner-summary">
            <strong>{accountOwners.length}</strong> account owners found with 
            <strong> {accountOwners.reduce((sum, o) => sum + o.accountCount, 0)}</strong> total accounts
          </div>
        </div>
      )}

      {!loadingOwners && accountOwners.length === 0 && (
        <div className="no-data-message">
          <div className="warning-icon">⚠️</div>
          <h3>No Data Available</h3>
          <p>
            No account owners found in the database. Please import partner data first
            using the Data Import feature.
          </p>
        </div>
      )}
    </div>
  );
}
