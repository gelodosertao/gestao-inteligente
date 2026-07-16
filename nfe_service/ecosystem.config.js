module.exports = {
  apps: [{
    name: 'nfe-service',
    script: 'dist/server.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
    },
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    max_memory_restart: '300M',
    error_file: 'server_error.log',
    out_file: 'server.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    kill_timeout: 10000,
    listen_timeout: 3000,
  }],
};
