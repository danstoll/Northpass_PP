import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardActionArea,
  Typography,
  Skeleton,
  Chip,
  LinearProgress,
  Avatar,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Storage,
  Sync,
  Assessment,
  Dashboard,
  People,
  Analytics,
  TrendingUp,
  TrendingDown,
  School,
  Business,
  CheckCircle,
  Group,
  Refresh,
  ArrowForward,
  Speed,
  DataUsage,
  PersonAdd,
  EmojiEvents,
  WorkspacePremium,
  Security,
  NavigateNext,
  AccessTime,
  LocalFireDepartment,
} from '@mui/icons-material';

const API_BASE = '/api/db';

const AdminHome = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kpiData, setKpiData] = useState(null);
  const [recentActivity, setRecentActivity] = useState(null);
  const [recentCertifications, setRecentCertifications] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setRefreshing(true);
    try {
      const [statsRes, kpiRes, activityRes, certsRes, syncRes] = await Promise.all([
        fetch(`${API_BASE}/stats`),
        fetch(`${API_BASE}/trends/kpi-summary`).catch(() => null),
        fetch(`${API_BASE}/reports/recent-activity?limit=5`).catch(() => null),
        fetch(`${API_BASE}/reports/recent-certifications?limit=8`).catch(() => null),
        fetch(`${API_BASE}/sync/task-status`).catch(() => null),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (kpiRes?.ok) {
        setKpiData(await kpiRes.json());
      }
      if (activityRes?.ok) {
        setRecentActivity(await activityRes.json());
      }
      if (certsRes?.ok) {
        setRecentCertifications(await certsRes.json());
      }
      if (syncRes?.ok) {
        setSyncStatus(await syncRes.json());
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
    setLoading(false);
    setRefreshing(false);
  };

  const quickLinks = [
    { 
      title: 'Data Management', 
      desc: 'Import and manage partner data', 
      icon: <Storage sx={{ fontSize: 28 }} />, 
      href: '/admin/data',
      color: '#FF6B35'
    },
    { 
      title: 'LMS Sync', 
      desc: 'Sync with Northpass LMS', 
      icon: <Sync sx={{ fontSize: 28 }} />, 
      href: '/admin/sync',
      color: '#6B4C9A'
    },
    { 
      title: 'Reports', 
      desc: 'Certification & compliance', 
      icon: <Assessment sx={{ fontSize: 28 }} />, 
      href: '/admin/dbreports',
      color: '#28a745'
    },
    { 
      title: 'Analytics', 
      desc: 'Trends & deep insights', 
      icon: <Analytics sx={{ fontSize: 28 }} />, 
      href: '/admin/analytics',
      color: '#17a2b8'
    },
    { 
      title: 'Owner Report', 
      desc: 'Partners by account owner', 
      icon: <Dashboard sx={{ fontSize: 28 }} />, 
      href: '/admin/owners',
      color: '#ffc107'
    },
    { 
      title: 'User Management', 
      desc: 'LMS users, groups & orphans', 
      icon: <People sx={{ fontSize: 28 }} />, 
      href: '/admin/users',
      color: '#dc3545'
    },
    { 
      title: 'Admin Users', 
      desc: 'Manage portal access', 
      icon: <Security sx={{ fontSize: 28 }} />, 
      href: '/admin/admin-users',
      color: '#795548'
    },
    { 
      title: 'PAM Management', 
      desc: 'Partner Account Managers', 
      icon: <WorkspacePremium sx={{ fontSize: 28 }} />, 
      href: '/admin/pams',
      color: '#9c27b0'
    },
  ];

  // KPI Card with trend
  const KpiCard = ({ icon, label, value, change, changeLabel, loading: isLoading, color = 'primary' }) => {
    const isPositive = change > 0;
    const isNegative = change < 0;
    
    return (
      <Card sx={{ height: '100%', position: 'relative', overflow: 'visible' }}>
        <CardContent sx={{ py: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ fontSize: '0.7rem', letterSpacing: 1 }}>
                {label}
              </Typography>
              {isLoading ? (
                <Skeleton variant="text" width={80} height={40} />
              ) : (
                <Typography variant="h4" fontWeight="bold" color="text.primary" sx={{ lineHeight: 1.2 }}>
                  {typeof value === 'number' ? value.toLocaleString() : value || '—'}
                </Typography>
              )}
              {change !== undefined && !isLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  {isPositive && <TrendingUp sx={{ fontSize: 16, color: 'success.main' }} />}
                  {isNegative && <TrendingDown sx={{ fontSize: 16, color: 'error.main' }} />}
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: isPositive ? 'success.main' : isNegative ? 'error.main' : 'text.secondary',
                      fontWeight: 500
                    }}
                  >
                    {isPositive ? '+' : ''}{change}% {changeLabel || 'vs last month'}
                  </Typography>
                </Box>
              )}
            </Box>
            <Avatar 
              sx={{ 
                bgcolor: `${color}.light`, 
                color: `${color}.main`,
                width: 48,
                height: 48
              }}
            >
              {icon}
            </Avatar>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Mini stat card
  const MiniStat = ({ label, value, icon, href }) => (
    <Card 
      variant="outlined" 
      sx={{ 
        cursor: href ? 'pointer' : 'default',
        transition: 'all 0.2s',
        '&:hover': href ? { borderColor: 'primary.main', bgcolor: 'action.hover' } : {}
      }}
      onClick={() => href && (window.location.href = href)}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ color: 'primary.main', opacity: 0.8 }}>{icon}</Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" fontWeight="bold" color="text.primary" sx={{ lineHeight: 1.2 }}>
              {loading ? <Skeleton width={40} /> : (value?.toLocaleString() || '0')}
            </Typography>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
          </Box>
          {href && <NavigateNext sx={{ color: 'text.disabled', fontSize: 20 }} />}
        </Box>
      </CardContent>
    </Card>
  );

  // Get last sync time from stats
  const lastSyncTime = stats?.lastSync?.started_at 
    ? new Date(stats.lastSync.started_at).toLocaleString()
    : null;

  // Calculate sync health
  const getSyncHealth = () => {
    if (!syncStatus?.tasks) return null;
    const enabledTasks = syncStatus.tasks.filter(t => t.enabled);
    const recentlyRun = enabledTasks.filter(t => {
      if (!t.last_run_at) return false;
      const hoursSince = (Date.now() - new Date(t.last_run_at).getTime()) / (1000 * 60 * 60);
      return hoursSince < (t.interval_minutes / 60) * 2;
    });
    return {
      healthy: recentlyRun.length,
      total: enabledTasks.length,
      percentage: enabledTasks.length > 0 ? Math.round((recentlyRun.length / enabledTasks.length) * 100) : 0
    };
  };

  const syncHealth = getSyncHealth();

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header with gradient background */}
      <Card 
        sx={{ 
          mb: 3, 
          background: 'linear-gradient(135deg, #6B4C9A 0%, #FF6B35 100%)',
          color: 'white',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Box 
          sx={{ 
            position: 'absolute', 
            right: -50, 
            top: -50, 
            width: 200, 
            height: 200, 
            borderRadius: '50%', 
            bgcolor: 'rgba(255,255,255,0.1)' 
          }} 
        />
        <Box 
          sx={{ 
            position: 'absolute', 
            right: 50, 
            bottom: -80, 
            width: 150, 
            height: 150, 
            borderRadius: '50%', 
            bgcolor: 'rgba(255,255,255,0.05)' 
          }} 
        />
        <CardContent sx={{ py: 4, position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography variant="h4" fontWeight="bold" gutterBottom>
                Partner Portal Dashboard
              </Typography>
              <Typography variant="body1" sx={{ opacity: 0.9 }}>
                Welcome to the Nintex Partner Portal administration center
              </Typography>
              {lastSyncTime && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
                  <AccessTime sx={{ fontSize: 16, opacity: 0.8 }} />
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Last sync: {lastSyncTime}
                  </Typography>
                </Box>
              )}
            </Box>
            <Tooltip title="Refresh data">
              <IconButton 
                onClick={fetchAllData} 
                disabled={refreshing}
                sx={{ 
                  bgcolor: 'rgba(255,255,255,0.15)', 
                  color: 'white',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                }}
              >
                <Refresh sx={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              </IconButton>
            </Tooltip>
          </Box>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <KpiCard 
          icon={<Business />}
          label="Total Partners"
          value={stats?.partners}
          change={kpiData?.partners?.mom_change}
          loading={loading}
          color="primary"
        />
        <KpiCard 
          icon={<People />}
          label="LMS Users"
          value={stats?.lmsUsers}
          change={kpiData?.users?.mom_change}
          loading={loading}
          color="info"
        />
        <KpiCard 
          icon={<EmojiEvents />}
          label="Certifications"
          value={stats?.completedEnrollments}
          change={kpiData?.certifications?.mom_change}
          loading={loading}
          color="success"
        />
        <KpiCard 
          icon={<School />}
          label="Active Courses"
          value={stats?.lmsCourses}
          loading={loading}
          color="warning"
        />
      </Box>

      {/* Two column layout */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' }, gap: 3, mb: 3 }}>
        {/* Quick Access Links */}
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Speed sx={{ color: 'primary.main' }} />
              Quick Access
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 2 }}>
              {quickLinks.map((link, idx) => (
                <Card 
                  key={idx}
                  variant="outlined"
                  sx={{ 
                    transition: 'all 0.2s',
                    '&:hover': {
                      borderColor: link.color,
                      transform: 'translateX(4px)',
                      boxShadow: 1,
                    }
                  }}
                >
                  <CardActionArea href={link.href} sx={{ py: 1.5, px: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ color: link.color }}>{link.icon}</Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold">{link.title}</Typography>
                        <Typography variant="caption" color="text.secondary">{link.desc}</Typography>
                      </Box>
                      <ArrowForward sx={{ color: 'text.disabled', fontSize: 18 }} />
                    </Box>
                  </CardActionArea>
                </Card>
              ))}
            </Box>
          </CardContent>
        </Card>

        {/* System Status */}
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DataUsage sx={{ color: 'primary.main' }} />
              System Status
            </Typography>
            
            {/* Sync Health */}
            {syncHealth && (
              <Box sx={{ mb: 3, mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Sync Tasks Health</Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {syncHealth.healthy}/{syncHealth.total} on schedule
                  </Typography>
                </Box>
                <LinearProgress 
                  variant="determinate" 
                  value={syncHealth.percentage} 
                  color={syncHealth.percentage >= 80 ? 'success' : syncHealth.percentage >= 50 ? 'warning' : 'error'}
                  sx={{ height: 8, borderRadius: 4 }}
                />
              </Box>
            )}

            {/* Database Stats */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>Database Overview</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <MiniStat label="Contacts" value={stats?.contacts} icon={<People sx={{ fontSize: 20 }} />} />
              <MiniStat label="LMS Groups" value={stats?.lmsGroups} icon={<Group sx={{ fontSize: 20 }} />} href="/admin/users" />
              <MiniStat label="Enrollments" value={stats?.totalEnrollments} icon={<School sx={{ fontSize: 20 }} />} />
              <MiniStat label="Linked Contacts" value={stats?.linkedContacts} icon={<CheckCircle sx={{ fontSize: 20 }} />} />
              <MiniStat label="Admin Users" value={stats?.adminUsers} icon={<Security sx={{ fontSize: 20 }} />} href="/admin/admin-users" />
              <MiniStat label="PAMs" value={stats?.partnerManagers} icon={<WorkspacePremium sx={{ fontSize: 20 }} />} href="/admin/pams" />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Recent Certifications */}
      {recentCertifications?.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EmojiEvents sx={{ color: 'success.main' }} />
                Recent Certifications
              </Typography>
              <Chip 
                label="View All" 
                size="small" 
                variant="outlined"
                onClick={() => window.location.href = '/admin/dbreports'}
                sx={{ cursor: 'pointer' }}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1 }}>
              {recentCertifications.map((cert, idx) => (
                <Box 
                  key={idx}
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 2, 
                    py: 1.5,
                    px: 2,
                    bgcolor: 'background.default',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                  <Avatar sx={{ width: 40, height: 40, bgcolor: 'success.light', color: 'success.main' }}>
                    <EmojiEvents sx={{ fontSize: 20 }} />
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {cert.user_name || cert.email}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {cert.course_name}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                      {cert.partner_name ? (
                        <Chip 
                          label={cert.partner_name} 
                          size="small" 
                          sx={{ 
                            height: 20, 
                            fontSize: '0.7rem',
                            bgcolor: 'primary.light',
                            color: 'primary.dark'
                          }} 
                        />
                      ) : (
                        <Chip 
                          label="No Partner" 
                          size="small" 
                          sx={{ 
                            height: 20, 
                            fontSize: '0.7rem',
                            bgcolor: 'grey.200',
                            color: 'grey.600'
                          }} 
                        />
                      )}
                      <Chip 
                        label={`${cert.npcu_value} NPCU`} 
                        size="small"
                        color="success"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.7rem' }} 
                      />
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {cert.completed_at ? new Date(cert.completed_at).toLocaleDateString() : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      {recentActivity?.length > 0 && (
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" fontWeight="bold" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocalFireDepartment sx={{ color: 'warning.main' }} />
                Recent Activity
              </Typography>
              <Chip 
                label="View All" 
                size="small" 
                variant="outlined"
                onClick={() => window.location.href = '/admin/dbreports'}
                sx={{ cursor: 'pointer' }}
              />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {recentActivity.map((activity, idx) => (
                <Box 
                  key={idx}
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 2, 
                    py: 1,
                    borderBottom: idx < recentActivity.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider'
                  }}
                >
                  <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.light', color: 'primary.main' }}>
                    {activity.type === 'certification' ? <EmojiEvents sx={{ fontSize: 18 }} /> : 
                     activity.type === 'enrollment' ? <School sx={{ fontSize: 18 }} /> : 
                     <PersonAdd sx={{ fontSize: 18 }} />}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={500} noWrap>
                      {activity.user_name || activity.email}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {activity.description || activity.course_name}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                    {activity.created_at ? new Date(activity.created_at).toLocaleDateString() : ''}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Box>
  );
};

export default AdminHome;
