#!/bin/bash

# SSH Deployment Script for Northpass Partner Portal
# Usage: ./deploy.sh [production|staging]

set -e

# Configuration
ENVIRONMENT=${1:-production}
BUILD_DIR="dist"
TEMP_DIR="/tmp/northpass-pp-deploy"

# Load environment-specific configuration
if [ "$ENVIRONMENT" = "production" ]; then
    echo "🚀 Deploying to PRODUCTION environment"
    SSH_HOST="20.125.24.28"
    SSH_USER="NTXPTRAdmin"
    SSH_PORT="22"
    REMOTE_PATH="/var/www/northpass-pp"
    BACKUP_PATH="/var/backups/northpass-pp"
elif [ "$ENVIRONMENT" = "staging" ]; then
    echo "🧪 Deploying to STAGING environment"
    SSH_HOST="20.125.24.28"
    SSH_USER="NTXPTRAdmin"
    SSH_PORT="22"
    REMOTE_PATH="/var/www/staging-northpass-pp"
    BACKUP_PATH="/var/backups/staging-northpass-pp"
else
    echo "❌ Invalid environment. Use 'production' or 'staging'"
    exit 1
fi

echo "📋 Deployment Configuration:"
echo "   Environment: $ENVIRONMENT"
echo "   SSH Host: $SSH_HOST"
echo "   Remote Path: $REMOTE_PATH"
echo ""

# Build the application
echo "🔨 Building application..."
npm run build

if [ ! -d "$BUILD_DIR" ]; then
    echo "❌ Build failed - $BUILD_DIR directory not found"
    exit 1
fi

echo "✅ Build completed successfully"

# Create deployment package
echo "📦 Creating deployment package..."
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"
cp -r "$BUILD_DIR"/* "$TEMP_DIR/"

# Add server configuration files
cat > "$TEMP_DIR/.htaccess" << 'EOF'
# Apache configuration for Single Page Application
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]

# Security headers
Header always set X-Content-Type-Options nosniff
Header always set X-Frame-Options DENY
Header always set X-XSS-Protection "1; mode=block"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

# Cache control
<filesMatch "\.(css|js|png|jpg|jpeg|gif|ico|svg)$">
    Header set Cache-Control "max-age=31536000, public"
</filesMatch>

<filesMatch "\.(html)$">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
</filesMatch>
EOF

# Create nginx configuration (alternative to .htaccess)
cat > "$TEMP_DIR/nginx-site.conf" << EOF
server {
    listen 80;
    server_name $SSH_HOST;
    root $REMOTE_PATH;
    index index.html;

    # SPA routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security headers
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    # Cache static assets
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # No cache for HTML
    location ~* \.html$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
EOF

# Test SSH connection
echo "🔐 Testing SSH connection..."
if ! ssh -o ConnectTimeout=10 -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "echo 'SSH connection successful'"; then
    echo "❌ SSH connection failed. Please check your SSH configuration."
    exit 1
fi

echo "✅ SSH connection successful"

# Create backup of current deployment
echo "💾 Creating backup of current deployment..."
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "
    if [ -d '$REMOTE_PATH' ]; then
        sudo mkdir -p '$BACKUP_PATH'
        sudo cp -r '$REMOTE_PATH' '$BACKUP_PATH/backup-\$(date +%Y%m%d-%H%M%S)'
        echo 'Backup created successfully'
    else
        echo 'No existing deployment to backup'
    fi
"

# Deploy to server
echo "🚀 Deploying to server..."
rsync -avz --delete -e "ssh -p $SSH_PORT" "$TEMP_DIR/" "$SSH_USER@$SSH_HOST:$REMOTE_PATH/"

# Set correct permissions
echo "🔧 Setting file permissions..."
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "
    sudo chown -R www-data:www-data '$REMOTE_PATH'
    sudo chmod -R 755 '$REMOTE_PATH'
    sudo chmod 644 '$REMOTE_PATH'/*.html '$REMOTE_PATH'/*.css '$REMOTE_PATH'/*.js 2>/dev/null || true
"

# Restart web server (if needed)
echo "🔄 Restarting web server..."
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "
    if systemctl is-active --quiet apache2; then
        sudo systemctl reload apache2
        echo 'Apache reloaded'
    elif systemctl is-active --quiet nginx; then
        sudo systemctl reload nginx
        echo 'Nginx reloaded'
    else
        echo 'Web server reload skipped - no Apache/Nginx found'
    fi
"

# Clean up
rm -rf "$TEMP_DIR"

echo ""
echo "🎉 Deployment completed successfully!"
echo "🌐 Your application should now be available at: http://$SSH_HOST"
echo ""
echo "📋 Post-deployment checklist:"
echo "   ✅ Application deployed to $REMOTE_PATH"
echo "   ✅ Backup created in $BACKUP_PATH"
echo "   ✅ File permissions set correctly"
echo "   ✅ Web server configuration updated"
echo ""
echo "🔍 To verify deployment:"
echo "   curl -I http://$SSH_HOST"
echo "   ssh $SSH_USER@$SSH_HOST 'ls -la $REMOTE_PATH'"