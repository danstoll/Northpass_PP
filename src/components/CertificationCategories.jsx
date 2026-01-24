import React, { useState, useEffect, useMemo } from 'react';
import './CertificationCategories.css';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Tabs,
  Tab,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  LinearProgress,
} from '@mui/material';
import {
  School as SchoolIcon,
  Category as CategoryIcon,
  Rule as RuleIcon,
  Business as BusinessIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  PlayArrow as PlayIcon,
  Refresh as RefreshIcon,
  Cloud as CloudIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  FilterList as FilterIcon,
  Sync as SyncIcon,
  Clear as ClearIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material';
import {
  PageHeader,
  PageContent,
  StatsRow,
  StatCard,
  SectionCard,
  SearchInput,
  FilterSelect,
  ActionButton,
  LoadingState,
  EmptyState,
  InfoButton,
} from './ui/NintexUI';

// Tab Panel component
function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

// Category colors
const CATEGORY_COLORS = {
  'nintex_ce': '#FF6B35',
  'nintex_k2': '#6B4C9A',
  'nintex_salesforce': '#00A1E0',
  'go_to_market': '#28a745',
  'uncategorized': '#999999'
};

const CertificationCategories = () => {
  // State
  const [tabIndex, setTabIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Data
  const [courses, setCourses] = useState([]);
  const [rules, setRules] = useState([]);
  const [partnerStats, setPartnerStats] = useState([]);
  const [categoryLabels, setCategoryLabels] = useState({});
  const [categories, setCategories] = useState([]);
  const [courseStats, setCourseStats] = useState([]);
  const [partnerSummary, setPartnerSummary] = useState(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [gtmFilter, setGtmFilter] = useState('');
  
  // Action states
  const [applying, setApplying] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  // Dialog state
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState({ category: '', pattern: '', priority: 50 });

  // Load data on mount
  useEffect(() => {
    loadCourses();
    loadRules();
  }, []);

  // Load when switching to partner stats tab
  useEffect(() => {
    if (tabIndex === 2 && partnerStats.length === 0) {
      loadPartnerStats();
    }
  }, [tabIndex]);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/db/certifications/courses');
      if (!response.ok) throw new Error('Failed to load courses');
      const data = await response.json();
      setCourses(data.courses || []);
      setCourseStats(data.stats || []);
      setCategories(data.categories || []);
      setCategoryLabels(data.categoryLabels || {});
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async () => {
    try {
      const response = await fetch('/api/db/certifications/rules');
      if (!response.ok) throw new Error('Failed to load rules');
      const data = await response.json();
      setRules(data.rules || []);
      if (data.categoryLabels) setCategoryLabels(data.categoryLabels);
      if (data.categories) setCategories(data.categories);
    } catch (err) {
      console.error('Error loading rules:', err);
    }
  };

  const loadPartnerStats = async () => {
    setLoading(true);
    try {
      let url = '/api/db/certifications/partner-stats?';
      if (tierFilter) url += `tier=${tierFilter}&`;
      if (gtmFilter) url += `hasGtm=${gtmFilter}&`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to load partner stats');
      const data = await response.json();
      setPartnerStats(data.partners || []);
      setPartnerSummary(data.summary || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.category || !newRule.pattern) {
      setError('Category and pattern are required');
      return;
    }
    
    try {
      const response = await fetch('/api/db/certifications/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRule),
      });
      if (!response.ok) throw new Error('Failed to add rule');
      
      setSuccess(`Rule added: "${newRule.pattern}" → ${categoryLabels[newRule.category]}`);
      setRuleDialogOpen(false);
      setNewRule({ category: '', pattern: '', priority: 50 });
      loadRules();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      const response = await fetch(`/api/db/certifications/rules/${ruleId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete rule');
      setSuccess('Rule deleted');
      loadRules();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleApplyRules = async () => {
    setApplying(true);
    setError(null);
    try {
      const response = await fetch('/api/db/certifications/apply-rules', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to apply rules');
      const data = await response.json();
      setSuccess(`Categorized ${data.categorized} courses (${data.unchanged} unchanged)`);
      loadCourses();
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  };

  const handleCalculateCounts = async () => {
    setCalculating(true);
    setError(null);
    try {
      const response = await fetch('/api/db/certifications/calculate-partner-counts', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to calculate counts');
      const data = await response.json();
      setSuccess(`Updated certification counts for ${data.updated} partners`);
      loadPartnerStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setCalculating(false);
    }
  };

  const handleUpdateCourseCategory = async (courseId, category) => {
    try {
      const response = await fetch(`/api/db/certifications/courses/${courseId}/category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category }),
      });
      if (!response.ok) throw new Error('Failed to update category');
      
      // Update local state
      setCourses(prev => prev.map(c => 
        c.id === courseId ? { ...c, certification_category: category } : c
      ));
      setSuccess('Course category updated');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSyncToImpartner = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await fetch('/api/db/certifications/sync-to-impartner', {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to sync');
      const data = await response.json();
      setSuccess(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  // Filter courses
  const filteredCourses = useMemo(() => {
    return courses.filter(c => {
      const matchesSearch = !searchTerm || 
        c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !categoryFilter || 
        (categoryFilter === 'uncategorized' ? !c.certification_category : c.certification_category === categoryFilter);
      return matchesSearch && matchesCategory;
    });
  }, [courses, searchTerm, categoryFilter]);

  // Filter partner stats
  const filteredPartners = useMemo(() => {
    return partnerStats.filter(p => {
      const matchesSearch = !searchTerm || 
        p.account_name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesSearch;
    });
  }, [partnerStats, searchTerm]);

  // Calculate stats for display
  const stats = useMemo(() => {
    const byCat = {};
    for (const cat of categories) {
      byCat[cat] = courses.filter(c => c.certification_category === cat).length;
    }
    byCat['uncategorized'] = courses.filter(c => !c.certification_category).length;
    return byCat;
  }, [courses, categories]);

  if (loading && courses.length === 0) {
    return <LoadingState message="Loading certification courses..." />;
  }

  return (
    <PageContent>
      <PageHeader
        icon={<SchoolIcon />}
        title="Certification Categories"
        subtitle="Categorize certifications for partner reporting and Impartner sync"
      />

      {/* Stats Row */}
      <StatsRow columns={5}>
        {categories.map(cat => (
          <StatCard
            key={cat}
            title={categoryLabels[cat] || cat}
            value={stats[cat] || 0}
            icon={<CategoryIcon style={{ color: CATEGORY_COLORS[cat] }} />}
          />
        ))}
        <StatCard
          title="Uncategorized"
          value={stats['uncategorized'] || 0}
          icon={<WarningIcon />}
          variant={stats['uncategorized'] > 0 ? 'warning' : 'default'}
        />
      </StatsRow>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)}>
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Courses<InfoButton tooltip="View all courses with their certification category, NPCU value, and categorization status." /></Box>} icon={<SchoolIcon />} iconPosition="start" />
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Categorization Rules<InfoButton tooltip="Define rules to automatically categorize courses based on name patterns (e.g., 'K2' → Nintex K2)." /></Box>} icon={<RuleIcon />} iconPosition="start" />
          <Tab label={<Box sx={{ display: 'flex', alignItems: 'center' }}>Partner Stats<InfoButton tooltip="View aggregated certification counts by category for each partner organization." /></Box>} icon={<BusinessIcon />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Tab: Courses */}
      <TabPanel value={tabIndex} index={0}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search courses..."
            sx={{ flex: 1, minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              label="Category"
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <MenuItem value="">All Categories</MenuItem>
              {categories.map(cat => (
                <MenuItem key={cat} value={cat}>{categoryLabels[cat]}</MenuItem>
              ))}
              <MenuItem value="uncategorized">Uncategorized</MenuItem>
            </Select>
          </FormControl>
          <ActionButton
            variant="contained"
            color="secondary"
            startIcon={<PlayIcon />}
            onClick={handleApplyRules}
            loading={applying}
          >
            Apply Rules
          </ActionButton>
          <ActionButton
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadCourses}
          >
            Refresh
          </ActionButton>
        </Box>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Course Name</TableCell>
                <TableCell>NPCU</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredCourses.map((course) => (
                <TableRow key={course.id}>
                  <TableCell>{course.name}</TableCell>
                  <TableCell>
                    <Chip 
                      label={course.npcu_value} 
                      size="small" 
                      color={course.npcu_value >= 2 ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <Select
                        value={course.certification_category || ''}
                        onChange={(e) => handleUpdateCourseCategory(course.id, e.target.value || null)}
                        displayEmpty
                      >
                        <MenuItem value="">
                          <em>Uncategorized</em>
                        </MenuItem>
                        {categories.map(cat => (
                          <MenuItem key={cat} value={cat}>
                            <Chip 
                              label={categoryLabels[cat]} 
                              size="small" 
                              sx={{ bgcolor: CATEGORY_COLORS[cat], color: 'white' }}
                            />
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                  <TableCell>
                    {course.certification_category && (
                      <Tooltip title="Clear category">
                        <IconButton 
                          size="small" 
                          onClick={() => handleUpdateCourseCategory(course.id, null)}
                        >
                          <ClearIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Tab: Rules */}
      <TabPanel value={tabIndex} index={1}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <ActionButton
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setRuleDialogOpen(true)}
          >
            Add Rule
          </ActionButton>
          <ActionButton
            variant="contained"
            color="secondary"
            startIcon={<PlayIcon />}
            onClick={handleApplyRules}
            loading={applying}
          >
            Apply All Rules
          </ActionButton>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Rules are applied in priority order (highest first). The first matching rule determines the category.
        </Typography>

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Priority</TableCell>
                <TableCell>Pattern</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.priority}</TableCell>
                  <TableCell>
                    <code>{rule.pattern}</code>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={categoryLabels[rule.category]} 
                      size="small" 
                      sx={{ bgcolor: CATEGORY_COLORS[rule.category], color: 'white' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Delete rule">
                      <IconButton 
                        size="small" 
                        color="error"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </TabPanel>

      {/* Tab: Partner Stats */}
      <TabPanel value={tabIndex} index={2}>
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <SearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search partners..."
            sx={{ flex: 1, minWidth: 200 }}
          />
          <FilterSelect
            value={tierFilter}
            onChange={setTierFilter}
            options={['Premier', 'Select', 'Registered', 'Certified']}
            label="Tier"
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>GTM Cert</InputLabel>
            <Select
              value={gtmFilter}
              label="GTM Cert"
              onChange={(e) => setGtmFilter(e.target.value)}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Has GTM</MenuItem>
              <MenuItem value="false">No GTM</MenuItem>
            </Select>
          </FormControl>
          <ActionButton
            variant="contained"
            color="primary"
            startIcon={<RefreshIcon />}
            onClick={handleCalculateCounts}
            loading={calculating}
          >
            Recalculate
          </ActionButton>
          <ActionButton
            variant="contained"
            color="secondary"
            startIcon={<SyncIcon />}
            onClick={handleSyncToImpartner}
            loading={syncing}
          >
            Sync to Impartner
          </ActionButton>
        </Box>

        {/* Summary Cards */}
        {partnerSummary && (
          <StatsRow columns={6} sx={{ mb: 3 }}>
            <StatCard
              title={<>Partners<Tooltip title="Total number of active partners with certification tracking" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip></>}
              value={partnerSummary.total_partners}
              icon={<BusinessIcon />}
            />
            <StatCard
              title={<>Total NPCU<Tooltip title="Nintex Partner Certification Units - Sum of all NPCU credits. Premier requires 20, Select requires 10, Registered requires 5" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip></>}
              value={partnerSummary.total_npcu || 0}
              icon={<SchoolIcon />}
              variant="primary"
            />
            <StatCard
              title={<>With GTM<Tooltip title="Partners with at least one Go-to-Market certification, required for marketing and sales activities" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip></>}
              value={partnerSummary.partners_with_gtm || 0}
              icon={<CheckIcon />}
              variant="success"
            />
            <StatCard
              title={<>Nintex CE Certs<Tooltip title="Nintex Automation Cloud (formerly Nintex Cloud Edition) certifications across all partners" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip></>}
              value={partnerSummary.total_nintex_ce || 0}
              icon={<CategoryIcon style={{ color: CATEGORY_COLORS['nintex_ce'] }} />}
            />
            <StatCard
              title={<>K2 Certs<Tooltip title="K2 platform certifications (legacy workflow and forms product)" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip></>}
              value={partnerSummary.total_nintex_k2 || 0}
              icon={<CategoryIcon style={{ color: CATEGORY_COLORS['nintex_k2'] }} />}
            />
            <StatCard
              title={<>Salesforce Certs<Tooltip title="Nintex for Salesforce integration certifications" arrow><IconButton size="small" sx={{ ml: 0.5, p: 0.25, opacity: 0.7 }}><InfoIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip></>}
              value={partnerSummary.total_salesforce || 0}
              icon={<CategoryIcon style={{ color: CATEGORY_COLORS['nintex_salesforce'] }} />}
            />
          </StatsRow>
        )}

        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Partner</TableCell>
                <TableCell>Tier</TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    NPCU
                    <Tooltip title="Nintex Partner Certification Units - Total certification credits. Premier=20, Select=10, Registered=5" arrow>
                      <InfoIcon sx={{ fontSize: 14, opacity: 0.6, cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    Nintex CE
                    <Tooltip title="Nintex Automation Cloud (formerly Nintex Cloud Edition) certifications" arrow>
                      <InfoIcon sx={{ fontSize: 14, opacity: 0.6, cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    K2
                    <Tooltip title="K2 platform certifications (legacy workflow/forms product)" arrow>
                      <InfoIcon sx={{ fontSize: 14, opacity: 0.6, cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    Salesforce
                    <Tooltip title="Nintex for Salesforce integration certifications" arrow>
                      <InfoIcon sx={{ fontSize: 14, opacity: 0.6, cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    GTM
                    <Tooltip title="Go-to-Market certification - Required for marketing and sales activities" arrow>
                      <InfoIcon sx={{ fontSize: 14, opacity: 0.6, cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                    Total
                    <Tooltip title="Total number of active certifications across all categories" arrow>
                      <InfoIcon sx={{ fontSize: 14, opacity: 0.6, cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPartners.map((partner) => (
                <TableRow key={partner.id}>
                  <TableCell>{partner.account_name}</TableCell>
                  <TableCell>
                    <Chip label={partner.partner_tier} size="small" />
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={partner.total_npcu || 0} 
                      size="small"
                      color={partner.total_npcu >= 20 ? 'success' : partner.total_npcu >= 10 ? 'primary' : 'default'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={partner.cert_count_nintex_ce} 
                      size="small"
                      sx={{ 
                        bgcolor: partner.cert_count_nintex_ce > 0 ? CATEGORY_COLORS['nintex_ce'] : undefined,
                        color: partner.cert_count_nintex_ce > 0 ? 'white' : undefined
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={partner.cert_count_nintex_k2} 
                      size="small"
                      sx={{ 
                        bgcolor: partner.cert_count_nintex_k2 > 0 ? CATEGORY_COLORS['nintex_k2'] : undefined,
                        color: partner.cert_count_nintex_k2 > 0 ? 'white' : undefined
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={partner.cert_count_nintex_salesforce} 
                      size="small"
                      sx={{ 
                        bgcolor: partner.cert_count_nintex_salesforce > 0 ? CATEGORY_COLORS['nintex_salesforce'] : undefined,
                        color: partner.cert_count_nintex_salesforce > 0 ? 'white' : undefined
                      }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    {partner.has_gtm_certification ? (
                      <Chip 
                        label={partner.cert_count_go_to_market}
                        size="small"
                        sx={{ bgcolor: CATEGORY_COLORS['go_to_market'], color: 'white' }}
                        icon={<CheckIcon style={{ color: 'white' }} />}
                      />
                    ) : (
                      <Chip 
                        label="0" 
                        size="small" 
                        variant="outlined" 
                        color="warning"
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <strong>{partner.total_certs}</strong>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {filteredPartners.length === 0 && !loading && (
          <EmptyState
            icon={<BusinessIcon />}
            title="No Partner Data"
            description="Click 'Recalculate' to compute certification counts for all partners."
          />
        )}
      </TabPanel>

      {/* Add Rule Dialog */}
      <Dialog open={ruleDialogOpen} onClose={() => setRuleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Categorization Rule</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={newRule.category}
                label="Category"
                onChange={(e) => setNewRule(prev => ({ ...prev, category: e.target.value }))}
              >
                {categories.map(cat => (
                  <MenuItem key={cat} value={cat}>{categoryLabels[cat]}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Pattern"
              value={newRule.pattern}
              onChange={(e) => setNewRule(prev => ({ ...prev, pattern: e.target.value }))}
              fullWidth
              helperText="Text to match in course name (case-insensitive)"
            />
            <TextField
              label="Priority"
              type="number"
              value={newRule.priority}
              onChange={(e) => setNewRule(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
              fullWidth
              helperText="Higher priority rules are applied first (default: 50)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRuleDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddRule}>Add Rule</Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
};

export default CertificationCategories;
