/**
 * Portal Settings - Admin configuration for partner tiers and notifications
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Alert, Snackbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, Chip, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Tooltip, Switch, FormControlLabel,
  Card, CardContent, Grid, Tabs, Tab, Select, MenuItem, FormControl,
  InputLabel
} from '@mui/material';
import { 
  Settings as SettingsIcon, Add, Edit, Delete,
  ArrowUpward, ArrowDownward, Check, Email as EmailIcon,
  Send as SendIcon, Notifications as NotificationsIcon,
  Description as TemplateIcon, Save as SaveIcon, Visibility as PreviewIcon
} from '@mui/icons-material';
import { PageHeader, PageContent, SectionCard, ActionButton } from './ui/NintexUI';
import { useAuth } from '../context/AuthContext';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

const DEFAULT_COLORS = [
  '#42A5F5', '#1565C0', '#FF6B35', '#FFD700', '#FFA500', 
  '#9C27B0', '#4CAF50', '#E91E63', '#00BCD4', '#795548'
];

export default function Settings() {
  const { token, hasPermission } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Notification testing state
  const [testingEmail, setTestingEmail] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);
  const [testingSystem, setTestingSystem] = useState(false);
  const [testEmailDialog, setTestEmailDialog] = useState({ open: false });
  const [testEmail, setTestEmail] = useState('');
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTier, setEditingTier] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    npcu_required: 0,
    color: '#666666',
    is_active: true
  });
  
  // Delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tierToDelete, setTierToDelete] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  
  // Template management state
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editTemplateDialog, setEditTemplateDialog] = useState({ open: false, template: null });
  const [templateForm, setTemplateForm] = useState({ subject: '', content: '', description: '', is_active: true });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [previewDialog, setPreviewDialog] = useState({ open: false, content: '' });

  const canEdit = hasPermission('settings', 'edit');

  // Fetch tiers
  const fetchTiers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/db/tiers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTiers(data);
      } else {
        throw new Error('Failed to load tiers');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchTiers();
      fetchTemplates();
    }
  }, [token, fetchTiers]);

  // Fetch notification templates
  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await fetch('/api/db/notification-templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Open template edit dialog
  const handleEditTemplate = (template) => {
    setTemplateForm({
      subject: template.subject || '',
      content: template.content || '',
      description: template.description || '',
      is_active: template.is_active !== false
    });
    setEditTemplateDialog({ open: true, template });
  };

  // Save template
  const handleSaveTemplate = async () => {
    if (!editTemplateDialog.template) return;
    setSavingTemplate(true);
    try {
      const response = await fetch(`/api/db/notification-templates/${editTemplateDialog.template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm)
      });
      if (response.ok) {
        setSuccess('Template saved successfully');
        setEditTemplateDialog({ open: false, template: null });
        fetchTemplates();
      } else {
        const data = await response.json();
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  // Preview template
  const handlePreviewTemplate = async (template) => {
    try {
      const response = await fetch(`/api/db/notification-templates/${template.template_key}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variables: {
            reportDate: new Date().toLocaleDateString(),
            pamFirstName: 'John',
            partnerTable: '<table><tr><td>Sample Partner</td><td>Premier</td></tr></table>',
            expiringCertsSection: '<p>No expiring certifications</p>',
            taskName: 'Sync Users',
            errorMessage: 'Connection timeout',
            timestamp: new Date().toLocaleString(),
            duration: '45',
            userName: 'Jane Doe',
            partnerName: 'Acme Corp'
          }
        })
      });
      if (response.ok) {
        const data = await response.json();
        setPreviewDialog({ open: true, content: data.content, subject: data.subject });
      }
    } catch (err) {
      setError('Failed to preview template');
    }
  };

  // Send test email via Nintex Workflow Cloud
  const sendTestEmail = async () => {
    if (!testEmail) return;
    try {
      setTestingEmail(true);
      const response = await fetch('/api/db/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail, commType: 'email' })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Test email sent successfully via Nintex Workflow Cloud');
        setTestEmailDialog({ open: false });
        setTestEmail('');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingEmail(false);
    }
  };

  // Send test Slack message via Nintex Workflow Cloud
  const sendSlackTest = async () => {
    try {
      setTestingSlack(true);
      const response = await fetch('/api/db/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commType: 'slack' })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Test Slack message sent to #partnerteam');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingSlack(false);
    }
  };

  // Send test System alert via Nintex Workflow Cloud
  const sendSystemTest = async () => {
    try {
      setTestingSystem(true);
      const response = await fetch('/api/db/email-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commType: 'system' })
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Test system alert sent to #partnerteam');
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setTestingSystem(false);
    }
  };

  // Open edit dialog
  const handleEdit = (tier) => {
    setEditingTier(tier);
    setEditForm({
      name: tier?.name || '',
      description: tier?.description || '',
      npcu_required: tier?.npcu_required || 0,
      color: tier?.color || '#666666',
      is_active: tier?.is_active !== false
    });
    setEditDialogOpen(true);
  };

  // Open add dialog
  const handleAdd = () => {
    setEditingTier(null);
    setEditForm({
      name: '',
      description: '',
      npcu_required: 0,
      color: DEFAULT_COLORS[tiers.length % DEFAULT_COLORS.length],
      is_active: true
    });
    setEditDialogOpen(true);
  };

  // Save tier (create or update)
  const handleSave = async () => {
    if (!editForm.name.trim()) {
      setError('Tier name is required');
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      const url = editingTier 
        ? `/api/db/tiers/${editingTier.id}`
        : '/api/db/tiers';
      
      const response = await fetch(url, {
        method: editingTier ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save tier');
      }
      
      setSuccess(editingTier ? 'Tier updated successfully' : 'Tier created successfully');
      setEditDialogOpen(false);
      fetchTiers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Open delete confirmation
  const handleDeleteClick = (tier) => {
    setTierToDelete(tier);
    setDeleteError(null);
    setDeleteDialogOpen(true);
  };

  // Confirm delete
  const handleDeleteConfirm = async () => {
    if (!tierToDelete) return;
    
    setSaving(true);
    setDeleteError(null);
    
    try {
      const response = await fetch(`/api/db/tiers/${tierToDelete.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete tier');
      }
      
      setSuccess(`Tier "${tierToDelete.name}" deleted successfully`);
      setDeleteDialogOpen(false);
      setTierToDelete(null);
      fetchTiers();
    } catch (err) {
      setDeleteError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Move tier up or down
  const handleMove = async (tier, direction) => {
    const currentIndex = tiers.findIndex(t => t.id === tier.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= tiers.length) return;
    
    // Swap tiers
    const newTiers = [...tiers];
    [newTiers[currentIndex], newTiers[newIndex]] = [newTiers[newIndex], newTiers[currentIndex]];
    
    // Update sort_order in database
    try {
      const tierIds = newTiers.map(t => t.id);
      const response = await fetch('/api/db/tiers/reorder', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tierIds })
      });
      
      if (response.ok) {
        setTiers(newTiers.map((t, i) => ({ ...t, sort_order: i + 1 })));
      }
    } catch (err) {
      console.error('Failed to reorder:', err);
    }
  };

  // Toggle active status
  const handleToggleActive = async (tier) => {
    try {
      const response = await fetch(`/api/db/tiers/${tier.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !tier.is_active })
      });
      
      if (response.ok) {
        setTiers(tiers.map(t => 
          t.id === tier.id ? { ...t, is_active: !tier.is_active } : t
        ));
      }
    } catch (err) {
      console.error('Failed to toggle active:', err);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <PageContent>
      <PageHeader
        icon={<SettingsIcon sx={{ color: '#6B4C9A' }} />}
        title="Portal Settings"
        subtitle="Manage partner tiers, notifications, and system configuration"
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
            <Tab icon={<SettingsIcon />} label="Partner Tiers" iconPosition="start" />
            <Tab icon={<NotificationsIcon />} label="Notifications" iconPosition="start" />
            <Tab icon={<TemplateIcon />} label="Message Templates" iconPosition="start" />
          </Tabs>
        </Box>

        {/* TAB 0: Partner Tiers */}
        <TabPanel value={tabValue} index={0}>
          <SectionCard 
            title="Partner Tiers" 
            icon="🏆"
            subtitle="Define the tiers available for partner classification and their NPCU requirements"
            action={
              canEdit && (
                <Button
                  variant="contained"
                  startIcon={<Add />}
                  onClick={handleAdd}
                  sx={{ 
                    backgroundColor: '#FF6B35',
                    '&:hover': { backgroundColor: '#E55A2B' }
                  }}
                >
                  Add Tier
                </Button>
              )
            }
          >
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    {canEdit && <TableCell sx={{ width: 80 }}>Order</TableCell>}
                    <TableCell sx={{ fontWeight: 600 }}>Tier</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 120 }}>NPCU Required</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: 100 }}>Status</TableCell>
                    {canEdit && <TableCell sx={{ fontWeight: 600, width: 120 }}>Actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tiers.map((tier, index) => (
                    <TableRow 
                      key={tier.id} 
                      hover
                      sx={{ 
                        opacity: tier.is_active ? 1 : 0.6,
                        backgroundColor: tier.is_active ? 'inherit' : '#f9f9f9'
                      }}
                >
                  {canEdit && (
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton 
                          size="small" 
                          onClick={() => handleMove(tier, 'up')}
                          disabled={index === 0}
                        >
                          <ArrowUpward fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" 
                          onClick={() => handleMove(tier, 'down')}
                          disabled={index === tiers.length - 1}
                        >
                          <ArrowDownward fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  )}
                  <TableCell>
                    <Chip 
                      label={tier.name} 
                      size="small"
                      sx={{ 
                        backgroundColor: tier.color || '#666',
                        color: isLightColor(tier.color) ? '#333' : '#fff',
                        fontWeight: 600
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {tier.description || '-'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body1" fontWeight={500}>
                      {tier.npcu_required}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Switch
                        checked={tier.is_active}
                        onChange={() => handleToggleActive(tier)}
                        size="small"
                        color="success"
                      />
                    ) : (
                      <Chip
                        label={tier.is_active ? 'Active' : 'Inactive'}
                        size="small"
                        color={tier.is_active ? 'success' : 'default'}
                      />
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Tooltip title="Edit">
                          <IconButton size="small" onClick={() => handleEdit(tier)}>
                            <Edit fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton 
                            size="small" 
                            onClick={() => handleDeleteClick(tier)}
                            color="error"
                          >
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {tiers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 6 : 4} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No tiers defined. Click "Add Tier" to create one.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Tip: Use the arrows to reorder tiers. Only active tiers appear in dropdowns throughout the portal.
          </Typography>
        </Box>
          </SectionCard>
        </TabPanel>

        {/* TAB 1: Notifications */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ p: 2, maxWidth: 900 }}>
            <Typography variant="h6" gutterBottom>Nintex Workflow Cloud Notifications</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              All portal notifications are sent via Nintex Workflow Cloud. The workflow branches based on the notification type (email, slack, or system).
            </Typography>

            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                  <Check sx={{ color: 'success.main' }} />
                  <Typography variant="subtitle1">Connected to Nintex Workflow Cloud</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Workflow branches: <strong>email</strong> (HTML emails), <strong>slack</strong> (user notifications), <strong>system</strong> (admin alerts to #partnerteam)
                </Typography>
              </CardContent>
            </Card>

            <Typography variant="subtitle1" gutterBottom sx={{ mt: 3 }}>Test Notifications</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Verify the notification integration is working correctly.
            </Typography>
            
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <EmailIcon color="primary" />
                      <Typography variant="subtitle2">Email</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Test email delivery
                    </Typography>
                    <Button
                      variant="outlined"
                      startIcon={<SendIcon />}
                      onClick={() => setTestEmailDialog({ open: true })}
                      fullWidth
                      size="small"
                    >
                      Send Test
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Box component="span" sx={{ fontSize: '1.25rem' }}>💬</Box>
                      <Typography variant="subtitle2">Slack</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Test user notification
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={sendSlackTest}
                      disabled={testingSlack}
                      fullWidth
                      size="small"
                      startIcon={testingSlack ? <CircularProgress size={16} /> : null}
                    >
                      {testingSlack ? 'Sending...' : 'Send Test'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Box component="span" sx={{ fontSize: '1.25rem' }}>🔔</Box>
                      <Typography variant="subtitle2">System</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Test admin alert
                    </Typography>
                    <Button
                      variant="outlined"
                      onClick={sendSystemTest}
                      disabled={testingSystem}
                      fullWidth
                      size="small"
                      startIcon={testingSystem ? <CircularProgress size={16} /> : null}
                    >
                      {testingSystem ? 'Sending...' : 'Send Test'}
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>

            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle1" gutterBottom>Notification Types</Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 100 }}>Channel</TableCell>
                      <TableCell sx={{ fontWeight: 600, width: 100 }}>varCommType</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>PAM Weekly Reports</TableCell>
                      <TableCell><Chip size="small" label="Email" color="primary" /></TableCell>
                      <TableCell><code>email</code></TableCell>
                      <TableCell>Partner certification summaries with expiring certs included</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>System Alerts</TableCell>
                      <TableCell><Chip size="small" label="Slack" sx={{ backgroundColor: '#4A154B', color: '#fff' }} /></TableCell>
                      <TableCell><code>system</code></TableCell>
                      <TableCell>Sync errors, data issues, admin notifications to #partnerteam</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>User Notifications</TableCell>
                      <TableCell><Chip size="small" label="Slack" sx={{ backgroundColor: '#4A154B', color: '#fff' }} /></TableCell>
                      <TableCell><code>slack</code></TableCell>
                      <TableCell>General announcements and user-facing messages</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            <Box sx={{ mt: 4 }}>
              <Typography variant="subtitle1" gutterBottom>Message Templates</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Template content is passed to the workflow via start variables.
              </Typography>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                      <TableCell sx={{ fontWeight: 600 }}>Variable</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Used By</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell><code>se_varcommtype</code></TableCell>
                      <TableCell>All</TableCell>
                      <TableCell>Workflow branch selector: email, slack, or system</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><code>se_varemail</code></TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Recipient email address</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><code>se_varemailsubject</code></TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Email subject line</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><code>se_varemailcontent</code></TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Email body (HTML supported)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><code>se_varemailattachement</code></TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Base64 encoded file attachment (optional)</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><code>se_varslackcontent</code></TableCell>
                      <TableCell>Slack / System</TableCell>
                      <TableCell>Slack message content (markdown supported)</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Box>
        </TabPanel>

        {/* TAB 2: Message Templates */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ p: 2, maxWidth: 1000 }}>
            <Typography variant="h6" gutterBottom>Notification Templates</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Edit the content of emails and Slack messages sent by the portal. Templates use <code>{'{{variable}}'}</code> placeholders that are replaced with actual values when sent.
            </Typography>

            {loadingTemplates ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={2}>
                {templates.map(template => (
                  <Grid item xs={12} md={6} key={template.id}>
                    <Card 
                      variant="outlined" 
                      sx={{ 
                        height: '100%',
                        opacity: template.is_active ? 1 : 0.6,
                        borderColor: template.is_active ? undefined : 'grey.300'
                      }}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {template.comm_type === 'email' && <EmailIcon color="primary" />}
                            {template.comm_type === 'slack' && <Box component="span" sx={{ fontSize: '1.25rem' }}>💬</Box>}
                            {template.comm_type === 'system' && <Box component="span" sx={{ fontSize: '1.25rem' }}>🔔</Box>}
                            <Typography variant="subtitle1">{template.template_name}</Typography>
                          </Box>
                          <Chip 
                            size="small" 
                            label={template.comm_type}
                            color={template.comm_type === 'email' ? 'primary' : 'default'}
                            sx={template.comm_type !== 'email' ? { backgroundColor: '#4A154B', color: '#fff' } : {}}
                          />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {template.description || 'No description'}
                        </Typography>
                        {template.subject && (
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                            Subject: <code>{template.subject}</code>
                          </Typography>
                        )}
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                          Variables: {JSON.parse(template.variables || '[]').map(v => <code key={v} style={{ marginRight: 4 }}>{`{{${v}}}`}</code>)}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button 
                            size="small" 
                            variant="outlined"
                            startIcon={<PreviewIcon />}
                            onClick={() => handlePreviewTemplate(template)}
                          >
                            Preview
                          </Button>
                          {canEdit && (
                            <Button 
                              size="small" 
                              variant="contained"
                              startIcon={<Edit />}
                              onClick={() => handleEditTemplate(template)}
                              sx={{ backgroundColor: '#FF6B35', '&:hover': { backgroundColor: '#E55A2B' } }}
                            >
                              Edit
                            </Button>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </TabPanel>
      </Paper>

      {/* Template Edit Dialog */}
      <Dialog 
        open={editTemplateDialog.open} 
        onClose={() => setEditTemplateDialog({ open: false, template: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Edit Template: {editTemplateDialog.template?.template_name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {editTemplateDialog.template?.comm_type === 'email' && (
              <TextField
                label="Email Subject"
                value={templateForm.subject}
                onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                fullWidth
                helperText="Use {{variable}} for dynamic content"
              />
            )}
            <TextField
              label="Content"
              value={templateForm.content}
              onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
              multiline
              rows={editTemplateDialog.template?.comm_type === 'email' ? 15 : 8}
              fullWidth
              helperText={editTemplateDialog.template?.comm_type === 'email' ? 'HTML supported' : 'Slack markdown supported (*bold*, _italic_, `code`)'}
              sx={{ fontFamily: 'monospace' }}
            />
            <TextField
              label="Description"
              value={templateForm.description}
              onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
              fullWidth
              helperText="Internal description for this template"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={templateForm.is_active}
                  onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked })}
                  color="success"
                />
              }
              label="Template Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTemplateDialog({ open: false, template: null })} disabled={savingTemplate}>
            Cancel
          </Button>
          <ActionButton
            variant="contained"
            onClick={handleSaveTemplate}
            loading={savingTemplate}
            startIcon={<SaveIcon />}
            sx={{ backgroundColor: '#FF6B35', '&:hover': { backgroundColor: '#E55A2B' } }}
          >
            Save Template
          </ActionButton>
        </DialogActions>
      </Dialog>

      {/* Template Preview Dialog */}
      <Dialog 
        open={previewDialog.open} 
        onClose={() => setPreviewDialog({ open: false, content: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Template Preview</DialogTitle>
        <DialogContent>
          {previewDialog.subject && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>Subject:</strong> {previewDialog.subject}
            </Alert>
          )}
          <Paper variant="outlined" sx={{ p: 2 }}>
            {previewDialog.content?.includes('<') ? (
              <div dangerouslySetInnerHTML={{ __html: previewDialog.content }} />
            ) : (
              <Typography component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                {previewDialog.content}
              </Typography>
            )}
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialog({ open: false, content: '' })}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Edit/Add Dialog */}
      <Dialog 
        open={editDialogOpen} 
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingTier ? `Edit Tier: ${editingTier.name}` : 'Add New Tier'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Tier Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
              fullWidth
              placeholder="e.g., Premier Plus"
            />
            <TextField
              label="Description"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
              placeholder="Brief description of this tier level"
            />
            <TextField
              label="NPCU Required"
              type="number"
              value={editForm.npcu_required}
              onChange={(e) => setEditForm({ ...editForm, npcu_required: parseInt(e.target.value) || 0 })}
              inputProps={{ min: 0 }}
              fullWidth
              helperText="Minimum NPCU points required for this tier qualification"
            />
            <Box>
              <Typography variant="subtitle2" gutterBottom>Badge Color</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {DEFAULT_COLORS.map(color => (
                  <Box
                    key={color}
                    onClick={() => setEditForm({ ...editForm, color })}
                    sx={{
                      width: 36,
                      height: 36,
                      backgroundColor: color,
                      borderRadius: 1,
                      cursor: 'pointer',
                      border: editForm.color === color ? '3px solid #333' : '1px solid #ccc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      '&:hover': { transform: 'scale(1.1)' },
                      transition: 'transform 0.1s'
                    }}
                  >
                    {editForm.color === color && (
                      <Check sx={{ color: isLightColor(color) ? '#333' : '#fff' }} />
                    )}
                  </Box>
                ))}
              </Box>
              <TextField
                size="small"
                value={editForm.color}
                onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                sx={{ mt: 1, width: 120 }}
                placeholder="#hex"
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  color="success"
                />
              }
              label="Active (visible in dropdowns)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <ActionButton
            variant="contained"
            onClick={handleSave}
            loading={saving}
            sx={{ 
              backgroundColor: '#FF6B35',
              '&:hover': { backgroundColor: '#E55A2B' }
            }}
          >
            {editingTier ? 'Save Changes' : 'Create Tier'}
          </ActionButton>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="sm"
      >
        <DialogTitle>Delete Tier?</DialogTitle>
        <DialogContent>
          {deleteError ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {deleteError}
            </Alert>
          ) : (
            <Typography>
              Are you sure you want to delete the tier <strong>"{tierToDelete?.name}"</strong>?
              This action cannot be undone.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <ActionButton
            variant="contained"
            color="error"
            onClick={handleDeleteConfirm}
            loading={saving}
            disabled={!!deleteError}
          >
            Delete Tier
          </ActionButton>
        </DialogActions>
      </Dialog>

      {/* Test Email Dialog */}
      <Dialog open={testEmailDialog.open} onClose={() => setTestEmailDialog({ open: false })}>
        <DialogTitle>Send Test Email via Nintex Workflow</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            This will send a test email through the Nintex Workflow Cloud workflow.
          </Typography>
          <TextField
            fullWidth
            label="Send test email to"
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            margin="normal"
            placeholder="your-email@example.com"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestEmailDialog({ open: false })}>Cancel</Button>
          <ActionButton 
            variant="contained" 
            onClick={sendTestEmail}
            loading={testingEmail}
            disabled={!testEmail}
          >
            Send Test Email
          </ActionButton>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!success}
        autoHideDuration={3000}
        onClose={() => setSuccess(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      </Snackbar>
    </PageContent>
  );
}

// Helper function to determine if a color is light (for text contrast)
function isLightColor(color) {
  if (!color) return false;
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
}
