#!/bin/bash

# Simple deployment script for 20.125.24.28
# This script deploys the built application to your Node.js server

set -e

echo "🚀 Deploying Northpass Partner Portal to 20.125.24.28"

# Configuration
SSH_HOST="20.125.24.28"
SSH_USER="NTXPTRAdmin"
SSH_PORT="22"
REMOTE_PATH="~/northpass-pp"  # Using home directory instead of /var/www
BUILD_DIR="dist"

# Build the application
echo "🔨 Building application..."
npm run build

if [ ! -d "$BUILD_DIR" ]; then
    echo "❌ Build failed - $BUILD_DIR directory not found"
    exit 1
fi

echo "✅ Build completed successfully"

# Test SSH connection
echo "🔐 Testing SSH connection..."
if ! ssh -o ConnectTimeout=15 -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "echo 'SSH connection successful'"; then
    echo "❌ SSH connection failed. Please check your connection."
    exit 1
fi

echo "✅ SSH connection successful"

# Create remote directory and backup if exists
echo "💾 Preparing remote directory..."
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "
    if [ -d '$REMOTE_PATH' ]; then
        cp -r '$REMOTE_PATH' '$REMOTE_PATH-backup-\$(date +%Y%m%d-%H%M%S)'
        echo 'Backup created'
    fi
    mkdir -p '$REMOTE_PATH'
    echo 'Directory prepared'
"

# Deploy files using scp (more reliable than rsync for this setup)
echo "🚀 Deploying files..."
scp -r -P "$SSH_PORT" "$BUILD_DIR"/* "$SSH_USER@$SSH_HOST:$REMOTE_PATH/"

# Create a simple Node.js server to serve the static files
echo "📝 Creating server configuration..."
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "
cat > '$REMOTE_PATH/server.js' << 'EOF'
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from current directory
app.use(express.static(__dirname));

// Handle SPA routing - serve index.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(\`🚀 Northpass Partner Portal running on http://0.0.0.0:\${PORT}\`);
    console.log(\`🌐 Access from outside: http://20.125.24.28:\${PORT}\`);
});
EOF

# Create package.json for the server
cat > '$REMOTE_PATH/package.json' << 'EOF'
{
  \"name\": \"northpass-partner-portal-server\",
  \"version\": \"1.0.0\",
  \"description\": \"Static file server for Northpass Partner Portal\",
  \"main\": \"server.js\",
  \"scripts\": {
    \"start\": \"node server.js\"
  },
  \"dependencies\": {
    \"express\": \"^4.18.2\"
  }
}
EOF

echo 'Server files created'
"

# Install dependencies and start the server
echo "📦 Installing server dependencies..."
ssh -p "$SSH_PORT" "$SSH_USER@$SSH_HOST" "
    cd '$REMOTE_PATH'
    npm install
    
    # Stop any existing process on port 3000
    pm2 stop northpass-portal 2>/dev/null || true
    pm2 delete northpass-portal 2>/dev/null || true
    
    # Start the new server with PM2
    pm2 start server.js --name northpass-portal
    pm2 save
    
    echo 'Server started successfully'
"

echo ""
echo "🎉 Deployment completed successfully!"
echo "🌐 Your application should now be available at:"
echo "   http://20.125.24.28:3000"
echo ""
echo "📋 Server Management Commands:"
echo "   pm2 list                    # View running processes"
echo "   pm2 logs northpass-portal   # View application logs"  
echo "   pm2 restart northpass-portal # Restart the application"
echo "   pm2 stop northpass-portal   # Stop the application"
echo ""
echo "🔍 To verify deployment:"
echo "   curl -I http://20.125.24.28:3000"