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
  Grid
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import EmailIcon from '@mui/icons-material/Email';
import SendIcon from '@mui/icons-material/Send';
import SettingsIcon from '@mui/icons-material/Settings';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import { PageHeader, StatCard, StatsRow, SectionCard } from './ui/NintexUI';

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

  // Executive report state
  const [execTask, setExecTask] = useState(null);
  const [execRecipients, setExecRecipients] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingRecipient, setAddingRecipient] = useState(false);

  // Dialog state
  const [configDialog, setConfigDialog] = useState({ open: false, task: null });
  const [scheduleDay, setScheduleDay] = useState('1'); // Monday default
  const [scheduleTime, setScheduleTime] = useState('08:00');

  // Test email dialog state
  const [testEmailDialog, setTestEmailDialog] = useState({ open: false, type: 'pam' });
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Recipients dialog state
  const [recipientsDialog, setRecipientsDialog] = useState(false);
  
  // Fetch scheduled tasks (PAM and Executive reports)
  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch('/api/db/tasks');
      if (response.ok) {
        const data = await response.json();
        const pamT = data.tasks?.find(t => t.task_type === 'pam_weekly_report');
        const execT = data.tasks?.find(t => t.task_type === 'executive_weekly_report');
        setPamTask(pamT || null);
        setExecTask(execT || null);
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
  }, []);

  // Fetch executive report recipients
  const fetchExecRecipients = useCallback(async () => {
    try {
      const response = await fetch('/api/db/pams/executive-report/recipients');
      if (response.ok) {
        const data = await response.json();
        setExecRecipients(data.recipients || []);
      }
    } catch (err) {
      console.error('Failed to fetch executive recipients:', err);
    }
  }, []);

  // Fetch available users for recipient selection (admin users from portal)
  const fetchAvailableUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/db/pams/executive-report/available-users');
      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (err) {
      console.error('Failed to fetch available users:', err);
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
    await Promise.all([fetchTasks(), fetchPamStats(), fetchEmailLogs(), fetchExecRecipients(), fetchAvailableUsers()]);
    setLoading(false);
  }, [fetchTasks, fetchPamStats, fetchEmailLogs, fetchExecRecipients, fetchAvailableUsers]);
  
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
        fetchTasks();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update task');
      }
    } catch (err) {
      setError(err.message);
    }
  };
  
  // Update task schedule (day, time, and interval)
  const updateTaskSchedule = async () => {
    if (!configDialog.task) return;

    try {
      // Update schedule day/time
      const scheduleResponse = await fetch(`/api/db/tasks/${configDialog.task.task_type}/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_day: parseInt(scheduleDay),
          schedule_time: scheduleTime
        })
      });

      if (!scheduleResponse.ok) {
        const data = await scheduleResponse.json();
        setError(data.error || 'Failed to update schedule');
        return;
      }

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      setSuccess(`${configDialog.task.task_name} scheduled for ${dayNames[parseInt(scheduleDay)]} at ${scheduleTime}`);
      setConfigDialog({ open: false, task: null });
      fetchTasks();
    } catch (err) {
      setError(err.message);
    }
  };

  // Open config dialog with task's current schedule
  const openConfigDialog = (task) => {
    if (task) {
      setScheduleDay(task.schedule_day?.toString() || '1');
      setScheduleTime(task.schedule_time?.substring(0, 5) || '08:00');
    }
    setConfigDialog({ open: true, task });
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
  
  // Send test email (PAM or Executive)
  const sendTestEmail = async () => {
    if (!testEmail) {
      setError('Please enter an email address');
      return;
    }

    setSendingTest(true);
    try {
      const endpoint = testEmailDialog.type === 'executive'
        ? '/api/db/pams/executive-report/send-test'
        : '/api/db/pams/send-test';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });

      const data = await response.json();

      if (response.ok) {
        const reportType = testEmailDialog.type === 'executive' ? 'Executive Report' : 'PAM Report';
        setSuccess(`Test ${reportType} email sent to ${testEmail}`);
        setTestEmailDialog({ open: false, type: 'pam' });
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

  // Run Executive Report now
  const runExecReportNow = async () => {
    setRunningTask('executive_weekly_report');
    try {
      const response = await fetch('/api/db/pams/executive-report/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Executive report sent to ${data.sent} recipient(s)`);
        fetchEmailLogs();
      } else {
        setError(data.error || 'Failed to send executive report');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningTask(null);
    }
  };

  // Add executive recipient
  const addExecRecipient = async () => {
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }

    const selectedUser = availableUsers.find(u => u.id === parseInt(selectedUserId));
    if (!selectedUser) {
      setError('Selected user not found');
      return;
    }

    setAddingRecipient(true);
    try {
      const response = await fetch('/api/db/pams/executive-report/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedUser.email,
          name: `${selectedUser.first_name} ${selectedUser.last_name}`.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(`Added ${selectedUser.email} to executive report recipients`);
        setSelectedUserId('');
        fetchExecRecipients();
      } else {
        setError(data.error || 'Failed to add recipient');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAddingRecipient(false);
    }
  };

  // Remove executive recipient
  const removeExecRecipient = async (id, email) => {
    try {
      const response = await fetch(`/api/db/pams/executive-report/recipients/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSuccess(`Removed ${email} from executive report recipients`);
        fetchExecRecipients();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to remove recipient');
      }
    } catch (err) {
      setError(err.message);
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
                      openConfigDialog(pamTask);
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
                        onClick={() => openConfigDialog(pamTask)}
                        size="small"
                      >
                        <SettingsIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
              
              {/* Executive Weekly Report Task */}
              <TableRow>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontSize: '1.25rem' }}>📊</span>
                    <Typography variant="body1" fontWeight={600}>
                      Executive Weekly Report
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    Global certification rollup to {execRecipients.length} executive recipient{execRecipients.length !== 1 ? 's' : ''}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip
                    label={formatInterval(execTask?.interval_minutes)}
                    size="small"
                    color="secondary"
                    variant="outlined"
                    onClick={() => openConfigDialog(execTask)}
                    sx={{ cursor: 'pointer' }}
                  />
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color={execTask?.enabled ? 'success.main' : 'text.secondary'}>
                    {getNextRunDisplay(execTask)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Typography variant="body2" color="text.secondary">
                    {execTask?.last_run_at
                      ? new Date(execTask.last_run_at).toLocaleString()
                      : 'Never'}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={execTask?.enabled || false}
                    onChange={(e) => toggleTaskEnabled(execTask, e.target.checked)}
                    disabled={!execTask}
                  />
                </TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Tooltip title="Run Now">
                      <span>
                        <IconButton
                          color="secondary"
                          onClick={runExecReportNow}
                          disabled={runningTask === 'executive_weekly_report' || execRecipients.length === 0}
                          size="small"
                        >
                          {runningTask === 'executive_weekly_report' ? (
                            <CircularProgress size={20} />
                          ) : (
                            <PlayArrowIcon />
                          )}
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Manage Recipients">
                      <IconButton
                        onClick={() => setRecipientsDialog(true)}
                        size="small"
                        color="secondary"
                      >
                        <GroupIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Settings">
                      <IconButton
                        onClick={() => {
                          openConfigDialog(execTask);
                        }}
                        size="small"
                      >
                        <SettingsIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
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
                <Typography variant="subtitle1" fontWeight={600}>Test PAM Email</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Send a sample PAM report email to preview content and formatting.
              </Typography>
              <Button
                variant="outlined"
                color="warning"
                startIcon={sendingTest ? <CircularProgress size={16} /> : <EmailIcon />}
                onClick={() => setTestEmailDialog({ open: true, type: 'pam' })}
                disabled={sendingTest}
                fullWidth
              >
                Test PAM Report
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined" sx={{ borderColor: 'secondary.main', borderWidth: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <AssessmentIcon color="secondary" />
                <Typography variant="subtitle1" fontWeight={600}>Test Executive Report</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Send a sample executive rollup report to preview the format.
              </Typography>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={sendingTest ? <CircularProgress size={16} /> : <AssessmentIcon />}
                onClick={() => setTestEmailDialog({ open: true, type: 'executive' })}
                disabled={sendingTest}
                fullWidth
              >
                Test Exec Report
              </Button>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <EmailIcon color="primary" />
                <Typography variant="subtitle1" fontWeight={600}>Manage PAM Recipients</Typography>
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

        <Grid item xs={12} sm={6} md={3}>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <GroupIcon color="secondary" />
                <Typography variant="subtitle1" fontWeight={600}>Executive Recipients</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Manage who receives the weekly executive certification rollup report.
              </Typography>
              <Button
                variant="outlined"
                color="secondary"
                startIcon={<GroupIcon />}
                onClick={() => setRecipientsDialog(true)}
                fullWidth
              >
                Manage ({execRecipients.length})
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
            Configure Schedule: {configDialog.task?.task_name || 'Weekly Report'}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
              Schedule when this report should be sent each week
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel>Day of Week</InputLabel>
                  <Select
                    value={scheduleDay}
                    onChange={(e) => setScheduleDay(e.target.value)}
                    label="Day of Week"
                  >
                    <MenuItem value="0">Sunday</MenuItem>
                    <MenuItem value="1">Monday</MenuItem>
                    <MenuItem value="2">Tuesday</MenuItem>
                    <MenuItem value="3">Wednesday</MenuItem>
                    <MenuItem value="4">Thursday</MenuItem>
                    <MenuItem value="5">Friday</MenuItem>
                    <MenuItem value="6">Saturday</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Time"
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
            </Grid>

            <Box sx={{ p: 2, backgroundColor: '#e3f2fd', borderRadius: 1, mb: 2 }}>
              <Typography variant="body2" color="primary">
                <strong>Schedule:</strong> Every {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseInt(scheduleDay)]} at {scheduleTime}
              </Typography>
            </Box>

            {configDialog.task?.schedule_day !== null && configDialog.task?.schedule_time && (
              <Box sx={{ p: 2, backgroundColor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  <strong>Current Schedule:</strong> {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][configDialog.task.schedule_day]} at {configDialog.task.schedule_time?.substring(0, 5)}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialog({ open: false, task: null })}>
            Cancel
          </Button>
          <Button variant="contained" onClick={updateTaskSchedule}>
            Save Schedule
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Test Email Dialog */}
      <Dialog open={testEmailDialog.open} onClose={() => setTestEmailDialog({ open: false, type: 'pam' })} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {testEmailDialog.type === 'executive' ? (
              <AssessmentIcon color="secondary" />
            ) : (
              <EmailIcon color="warning" />
            )}
            Send Test {testEmailDialog.type === 'executive' ? 'Executive Report' : 'PAM Report'}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              {testEmailDialog.type === 'executive'
                ? 'This will send a sample Executive Weekly Report with live certification data to the email address you enter.'
                : 'This will send a sample PAM Weekly Report email with test data to the email address you enter.'}
            </Alert>

            <TextField
              fullWidth
              label="Email Address"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="Enter your email address"
              autoFocus
              helperText={testEmailDialog.type === 'executive'
                ? 'The executive report includes global certification metrics, regional breakdowns, and PAM performance'
                : 'The test email will show sample partner data and formatting'}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setTestEmailDialog({ open: false, type: 'pam' }); setTestEmail(''); }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={testEmailDialog.type === 'executive' ? 'secondary' : 'warning'}
            onClick={sendTestEmail}
            disabled={!testEmail || sendingTest}
            startIcon={sendingTest ? <CircularProgress size={16} /> : <SendIcon />}
          >
            {sendingTest ? 'Sending...' : 'Send Test'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Executive Recipients Dialog */}
      <Dialog open={recipientsDialog} onClose={() => setRecipientsDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <GroupIcon color="secondary" />
            Executive Report Recipients
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Alert severity="info" sx={{ mb: 3 }}>
              These recipients will receive the weekly executive certification rollup report containing global metrics, regional breakdowns, and PAM performance data.
            </Alert>

            {/* Add Recipient Form */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'flex-start' }}>
              <FormControl sx={{ flex: 1 }} size="small">
                <InputLabel>Select User</InputLabel>
                <Select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  label="Select User"
                >
                  <MenuItem value="">
                    <em>Select a user...</em>
                  </MenuItem>
                  {availableUsers
                    .filter(u => !execRecipients.some(r => r.email === u.email))
                    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
                    .map(user => (
                      <MenuItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name} ({user.email})
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
              <Button
                variant="contained"
                color="secondary"
                startIcon={addingRecipient ? <CircularProgress size={16} /> : <AddIcon />}
                onClick={addExecRecipient}
                disabled={!selectedUserId || addingRecipient}
              >
                Add
              </Button>
            </Box>

            {/* Recipients List */}
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Added</TableCell>
                    <TableCell sx={{ fontWeight: 600, textAlign: 'center' }}>Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {execRecipients.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No recipients configured. Add recipients above to enable the executive report.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    execRecipients.map((recipient) => (
                      <TableRow key={recipient.id}>
                        <TableCell>{recipient.name || '-'}</TableCell>
                        <TableCell>{recipient.email}</TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {new Date(recipient.created_at).toLocaleDateString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title="Remove recipient">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => removeExecRecipient(recipient.id, recipient.email)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecipientsDialog(false)}>
            Close
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={runningTask === 'executive_weekly_report' ? <CircularProgress size={16} /> : <SendIcon />}
            onClick={() => { runExecReportNow(); setRecipientsDialog(false); }}
            disabled={execRecipients.length === 0 || runningTask === 'executive_weekly_report'}
          >
            Send Report Now
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default EmailSchedules;
