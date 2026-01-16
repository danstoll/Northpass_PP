import { useState, useEffect, useCallback } from 'react';
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
  Button,
  Switch,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Grid
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EmailIcon from '@mui/icons-material/Email';
import SendIcon from '@mui/icons-material/Send';
import HistoryIcon from '@mui/icons-material/History';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { PageHeader, StatCard, StatsRow, SectionCard, ActionButton } from './ui/NintexUI';

/**
 * EmailSchedules Component
 * Shows scheduled email tasks and allows manual triggering
 */
function EmailSchedules() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Scheduled tasks state
  const [pamTask, setPamTask] = useState(null);
  const [pamStats, setPamStats] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [runningTask, setRunningTask] = useState(null);
  
  // Dialog state
  const [configDialog, setConfigDialog] = useState({ open: false, task: null });
  const [newInterval, setNewInterval] = useState('');
  
  // Test email dialog state
  const [testEmailDialog, setTestEmailDialog] = useState({ open: false });
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  
  // Fetch scheduled task for PAM reports
  const fetchPamTask = useCallback(async () => {
    try {
      const response = await fetch('/api/db/tasks');
      if (response.ok) {
        const data = await response.json();
        const task = data.tasks?.find(t => t.task_type === 'pam_weekly_report');
        setPamTask(task || null);
      }
    } catch (err) {
      console.error('Failed to fetch PAM task:', err);
    }
  }, []);
  
  // Fetch PAM stats
  const fetchPamStats = useCallback(async () => {
    try {
      const response = await fetch('/api/db/pams');
      if (response.ok) {
        const data = await response.json();
        setPamStats(data.stats || null);
      }
    } catch (err) {
      console.error('Failed to fetch PAM stats:', err);
    }
  }, []);
  
  // Fetch email logs
  const fetchEmailLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/db/pams/email-logs?limit=20');
      if (response.ok) {
        const data = await response.json();
        setEmailLogs(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch email logs:', err);
    }
  }, []);
  
  // Load all data
  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchPamTask(), fetchPamStats(), fetchEmailLogs()]);
    setLoading(false);
  }, [fetchPamTask, fetchPamStats, fetchEmailLogs]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // Clear messages after timeout
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);
  
  // Toggle task enabled
  const toggleTaskEnabled = async (task, enabled) => {
    try {
      const response = await fetch(`/api/db/tasks/${task.task_type}/enabled`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      
      if (response.ok) {
        setSuccess(`${task.task_name} ${enabled ? 'enabled' : 'disabled'}`);
        fetchPamTask();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update task');
      }
    } catch (err) {
      setError(err.message);
    }
  };
  
  // Update task interval
  const updateTaskInterval = async () => {
    if (!configDialog.task || !newInterval) return;
    
    try {
      const response = await fetch(`/api/db/tasks/${configDialog.task.task_type}/interval`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interval_minutes: parseInt(newInterval) })
      });
      
      if (response.ok) {
        setSuccess(`${configDialog.task.task_name} interval updated to ${newInterval} minutes`);
        setConfigDialog({ open: false, task: null });
        fetchPamTask();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update interval');
      }
    } catch (err) {
      setError(err.message);
    }
  };
  
  // Run PAM reports now
  const runPamReportsNow = async () => {
    setRunningTask('pam_weekly_report');
    try {
      const response = await fetch('/api/db/pams/send-all-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(`Reports sent: ${data.sent} successful, ${data.failed} failed`);
        fetchEmailLogs();
      } else {
        setError(data.error || 'Failed to send reports');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningTask(null);
    }
  };
  
  // Send test email
  const sendTestEmail = async () => {
    if (!testEmail) {
      setError('Please enter an email address');
      return;
    }
    
    setSendingTest(true);
    try {
      const response = await fetch('/api/db/pams/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setSuccess(`Test email sent to ${testEmail}`);
        setTestEmailDialog({ open: false });
        setTestEmail('');
        fetchEmailLogs();
      } else {
        setError(data.error || 'Failed to send test email');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingTest(false);
    }
  };
  
  // Calculate next run time
  const getNextRunDisplay = (task) => {
    if (!task) return '-';
    if (!task.enabled) return 'Disabled';
    if (!task.next_run_at) return 'Pending';
    
    const nextRun = new Date(task.next_run_at);
    const now = new Date();
    const diffMs = nextRun - now;
    
    if (diffMs < 0) return 'Running...';
    if (diffMs < 60000) return 'Within 1 minute';
    if (diffMs < 3600000) return `In ${Math.round(diffMs / 60000)} minutes`;
    if (diffMs < 86400000) return `In ${Math.round(diffMs / 3600000)} hours`;
    return nextRun.toLocaleDateString();
  };
  
  // Format interval for display
  const formatInterval = (minutes) => {
    if (!minutes) return '-';
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} hours`;
    if (minutes === 1440) return '1 day';
    if (minutes === 10080) return '1 week';
    return `${Math.round(minutes / 1440)} days`;
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        icon="📧"
        title="Email Schedules"
        subtitle="Manage scheduled email notifications and reports"
        action={
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadData}
          >
            Refresh
          </Button>
        }
      />
      
      {/* Alerts */}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      
      {/* Stats Row */}
      <StatsRow columns={4}>
        <StatCard
          title="Active PAMs"
          value={pamStats?.activePams || 0}
          icon="👥"
          variant="primary"
        />
        <StatCard
          title="Email Enabled"
          value={pamStats?.emailEnabled || 0}
          icon="📧"
          variant="success"
        />
        <StatCard
          title="Recent Emails"
          value={emailLogs.length}
          icon="📤"
          variant="info"
        />
        <StatCard
          title="Schedule Status"
          value={pamTask?.enabled ? 'Active' : 'Disabled'}
          icon={pamTask?.enabled ? '✅' : '⏸️'}
          variant={pamTask?.enabled ? 'success' : 'warning'}
        />
      </StatsRow>
      
      {/* Scheduled Tasks Section */}
      <SectionCard title="Scheduled Email Tasks" icon="📅" sx={{ mt: 3 }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600 }}>Task</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Frequency</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Next Run</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Last Run</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Enabled</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* PAM Weekly Reports Task */}
              <TableRow>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '1.25rem' }}>📧</span>
                    <Typography variant="body1" fontWeight={600}>
                      PAM Weekly Reports
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    Send certification reports to {pamStats?.emailEnabled || 0} Partner Account Managers
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={formatInterval(pamTask?.interval_minutes)}
                    size="small"
                    color="primary"
                    variant="outlined"
                    onClick={() => {
                      setNewInterval(pamTask?.interval_minutes?.toString() || '10080');
                      setConfigDialog({ open: true, task: pamTask });
                    }}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color={pamTask?.enabled ? 'success.main' : 'text.secondary'}>
                    {getNextRunDisplay(pamTask)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color="text.secondary">
                    {pamTask?.last_run_at 
                      ? new Date(pamTask.last_run_at).toLocaleString() 
                      : 'Never'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={pamTask?.enabled || false}
                    onChange={(e) => toggleTaskEnabled(pamTask, e.target.checked)}
                    disabled={!pamTask}
                  />
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Tooltip title="Run Now">
                      <span>
                        <IconButton
                          color="primary"
                          onClick={runPamReportsNow}
                          disabled={runningTask === 'pam_weekly_report'}
                          size="small"
                        >
                          {runningTask === 'pam_weekly_report' ? (
                            <CircularProgress size={20} />
                          ) : (
                            <PlayArrowIcon />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Settings">
                      <IconButton
                        onClick={() => {
                          setNewInterval(pamTask?.interval_minutes?.toString() || '10080');
                          setConfigDialog({ open: true, task: pamTask });
                        }}
                        size="small"
                      >
                        <SettingsIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
              
              {/* Placeholder for future email tasks */}
              <TableRow sx={{ backgroundColor: '#fafafa' }}>
                <TableCell colSpan={7} align="center" sx={{ py: 2 }}>
                  <Typography variant="body2" color="text.secondary" fontStyle="italic">
                    More scheduled notifications coming soon...
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>
      
      {/* Quick Actions */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <SendIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>Send Reports Now</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Manually trigger PAM weekly reports for all enabled recipients ({pamStats?.emailEnabled || 0} PAMs).
              </Typography>
              <Button
                variant="contained"
                startIcon={runningTask === 'pam_weekly_report' ? <CircularProgress size={16} /> : <PlayArrowIcon />}
                onClick={runPamReportsNow}
                disabled={runningTask === 'pam_weekly_report'}
                fullWidth
              >
                {runningTask === 'pam_weekly_report' ? 'Sending...' : 'Send All Reports'}
              </Button>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ borderColor: 'warning.main', borderWidth: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <EmailIcon color="warning" />
                <Typography variant="subtitle1" fontWeight={600}>Test Email</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Send a test notification to any email address to preview content and formatting.
              </Typography>
              <Button
                variant="outlined"
                color="warning"
                startIcon={sendingTest ? <CircularProgress size={16} /> : <EmailIcon />}
                onClick={() => setTestEmailDialog({ open: true })}
                disabled={sendingTest}
                fullWidth
              >
                Send Test Email
              </Button>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <ScheduleIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>Schedule Settings</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Currently set to run every {formatInterval(pamTask?.interval_minutes)}. 
                Typical settings: weekly (10080 min) or daily (1440 min).
              </Typography>
              <Button
                variant="outlined"
                startIcon={<SettingsIcon />}
                onClick={() => {
                  setNewInterval(pamTask?.interval_minutes?.toString() || '10080');
                  setConfigDialog({ open: true, task: pamTask });
                }}
                fullWidth
              >
                Configure Schedule
              </Button>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <EmailIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>Manage Recipients</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                View and manage PAM email settings. Enable or disable reports for individual PAMs.
              </Typography>
              <Button
                variant="outlined"
                component="a"
                href="/admin/pam?active=true"
                fullWidth
              >
                Manage PAMs
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Recent Email History */}
      <SectionCard title="Recent Email History" icon="📤" sx={{ mt: 3 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Recipient</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Subject</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Type</TableCell>
                <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {emailLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">No email logs found</Typography>
                  </TableCell>
                </TableRow>
              ) : (
                emailLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(log.created_at).toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{log.recipient_name || log.recipient_email}</Typography>
                      {log.recipient_name && (
                        <Typography variant="caption" color="text.secondary">
                          {log.recipient_email}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                        {log.subject}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={log.email_type || 'pam_report'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        icon={log.status === 'sent' ? <CheckCircleIcon /> : <ErrorIcon />}
                        label={log.status}
                        size="small"
                        color={log.status === 'sent' ? 'success' : 'error'}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </SectionCard>
      
      {/* Config Dialog */}
      <Dialog open={configDialog.open} onClose={() => setConfigDialog({ open: false, task: null })} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScheduleIcon />
            Configure Schedule: {configDialog.task?.task_name || 'PAM Weekly Reports'}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Frequency</InputLabel>
              <Select
                value={newInterval}
                onChange={(e) => setNewInterval(e.target.value)}
                label="Frequency"
              >
                <MenuItem value="60">Hourly (60 minutes)</MenuItem>
                <MenuItem value="360">Every 6 hours</MenuItem>
                <MenuItem value="720">Every 12 hours</MenuItem>
                <MenuItem value="1440">Daily (1440 minutes)</MenuItem>
                <MenuItem value="10080">Weekly (10080 minutes)</MenuItem>
                <MenuItem value="20160">Every 2 weeks</MenuItem>
                <MenuItem value="43200">Monthly (30 days)</MenuItem>
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              label="Custom Interval (minutes)"
              type="number"
              value={newInterval}
              onChange={(e) => setNewInterval(e.target.value)}
              helperText="Or enter a custom interval in minutes"
            />
            
            <Box sx={{ mt: 3, p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary">
                <strong>Current Setting:</strong> {formatInterval(configDialog.task?.interval_minutes)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>New Setting:</strong> {formatInterval(parseInt(newInterval))}
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialog({ open: false, task: null })}>
            Cancel
          </Button>
          <Button variant="contained" onClick={updateTaskInterval}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Test Email Dialog */}
      <Dialog open={testEmailDialog.open} onClose={() => setTestEmailDialog({ open: false })} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EmailIcon color="warning" />
            Send Test Email
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              This will send a sample PAM Weekly Report email with test data to the email address you enter.
            </Alert>
            
            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter your email address"
              autoFocus
              helperText="The test email will show sample partner data and formatting"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setTestEmailDialog({ open: false }); setTestEmail(''); }}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            color="warning"
            onClick={sendTestEmail}
            disabled={!testEmail || sendingTest}
            startIcon={sendingTest ? <CircularProgress size={16} /> : <SendIcon />}
          >
            {sendingTest ? 'Sending...' : 'Send Test'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default EmailSchedules;
