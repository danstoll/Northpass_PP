# SSH Deployment Guide for Northpass Partner Portal

## Prerequisites

### On Your Local Machine:
- Node.js and npm installed
- SSH client available (OpenSSH on Windows/Linux/Mac)
- rsync installed (optional but recommended)

### On Your Server:
- Web server (Apache or Nginx)
- SSH access with sudo privileges
- Node.js (if you want to build on server)

## Quick Setup

### 1. Configure Your Server Details

Copy the example configuration:
```bash
cp deploy-config.env.example deploy-config.env
```

Edit `deploy-config.env` with your server details:
```bash
PROD_SSH_HOST="your-server.com"
PROD_SSH_USER="your-username"
PROD_SSH_PORT="22"
PROD_REMOTE_PATH="/var/www/northpass-pp"
```

### 2. Set Up SSH Key Authentication (Recommended)

Generate SSH key (if you don't have one):
```bash
ssh-keygen -t rsa -b 4096 -C "your-email@domain.com"
```

Copy public key to server:
```bash
ssh-copy-id -p 22 your-username@your-server.com
```

Test connection:
```bash
ssh your-username@your-server.com
```

### 3. Deploy to Production

**Linux/Mac/WSL:**
```bash
chmod +x deploy.sh
./deploy.sh production
```

**Windows PowerShell:**
```powershell
.\deploy.ps1 -Environment production
```

## Web Server Configuration

### Apache Configuration

Create virtual host file `/etc/apache2/sites-available/northpass-pp.conf`:
```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /var/www/northpass-pp
    
    # Enable rewrite module for SPA routing
    RewriteEngine On
    RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI} -f [OR]
    RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI} -d
    RewriteRule ^ - [L]
    RewriteRule ^ /index.html [L]
    
    # Security headers
    Header always set X-Content-Type-Options nosniff
    Header always set X-Frame-Options DENY
    Header always set X-XSS-Protection "1; mode=block"
    
    ErrorLog ${APACHE_LOG_DIR}/northpass-pp_error.log
    CustomLog ${APACHE_LOG_DIR}/northpass-pp_access.log combined
</VirtualHost>
```

Enable the site:
```bash
sudo a2ensite northpass-pp.conf
sudo a2enmod rewrite headers
sudo systemctl reload apache2
```

### Nginx Configuration

Create configuration file `/etc/nginx/sites-available/northpass-pp`:
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/northpass-pp;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";

    # Cache static assets
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Logging
    access_log /var/log/nginx/northpass-pp_access.log;
    error_log /var/log/nginx/northpass-pp_error.log;
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/northpass-pp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL Setup with Let's Encrypt

Install Certbot:
```bash
sudo apt update
sudo apt install certbot python3-certbot-apache  # For Apache
# OR
sudo apt install certbot python3-certbot-nginx   # For Nginx
```

Generate SSL certificate:
```bash
sudo certbot --apache -d your-domain.com        # For Apache
# OR  
sudo certbot --nginx -d your-domain.com         # For Nginx
```

## Deployment Features

### ✅ What the Deployment Script Does:
- Builds optimized production version
- Creates server backups before deployment
- Transfers files via SSH/rsync
- Sets correct file permissions
- Configures web server for SPA routing
- Adds security headers
- Enables asset caching
- Restarts web server gracefully

### 🔧 Advanced Options:

**Deploy to staging:**
```bash
./deploy.sh staging
```

**Manual deployment (if scripts fail):**
```bash
npm run build
scp -r dist/* user@server:/var/www/northpass-pp/
```

## Troubleshooting

### Common Issues:

**SSH Connection Failed:**
- Verify server details in deploy-config.env
- Test SSH connection manually: `ssh user@server`
- Check firewall settings on server

**Permission Denied:**
- Ensure your user has sudo privileges
- Check file ownership: `sudo chown -R www-data:www-data /var/www/northpass-pp`

**404 Errors on Refresh:**
- Verify SPA routing is configured correctly
- Check web server configuration files
- Ensure .htaccess is uploaded (Apache) or nginx config is correct

**API Calls Failing:**
- Check CORS settings
- Verify API endpoints are accessible from server
- Check firewall rules for outbound connections

### Monitoring:

**Check deployment:**
```bash
curl -I http://your-domain.com
```

**View logs:**
```bash
# Apache
sudo tail -f /var/log/apache2/northpass-pp_error.log

# Nginx  
sudo tail -f /var/log/nginx/northpass-pp_error.log
```

**Check disk space:**
```bash
df -h /var/www/
```

## Rollback Procedure

If deployment fails, restore from backup:
```bash
ssh user@server
sudo cp -r /var/backups/northpass-pp/backup-YYYYMMDD-HHMMSS/* /var/www/northpass-pp/
sudo systemctl reload apache2  # or nginx
```

## Security Recommendations

1. **Use SSH keys** instead of passwords
2. **Enable firewall** and close unnecessary ports
3. **Keep server updated**: `sudo apt update && sudo apt upgrade`
4. **Use SSL certificates** (Let's Encrypt is free)
5. **Regular backups** of both application and server
6. **Monitor server logs** for suspicious activity
7. **Use fail2ban** to prevent brute force attacks

## Performance Optimization

1. **Enable Gzip compression** in web server
2. **Set up CDN** for static assets (optional)
3. **Monitor server resources** (CPU, RAM, disk)
4. **Use HTTP/2** if available
5. **Optimize images** before deployment

Your Northpass Partner Portal is now ready for production deployment via SSH! 🚀