// PM2 Ecosystem Configuration File
// This ensures NODE_ENV is properly set and persisted
module.exports = {
  apps: [{
    name: 'northpass-portal',
    script: 'server-with-proxy.cjs',
    cwd: '/home/NTXPTRAdmin/northpass-portal',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '/home/NTXPTRAdmin/northpass-portal/logs/error.log',
    out_file: '/home/NTXPTRAdmin/northpass-portal/logs/out.log',
    merge_logs: true,
    // Restart policy
    min_uptime: '10s',
    max_restarts: 10
  }]
};
