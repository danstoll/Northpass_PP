#!/bin/bash

# Complete deployment script to run on the server
# Upload this file and run it when SSH connection is stable

echo "🚀 Starting Northpass Partner Portal deployment..."

# Navigate to deployment directory
cd ~/northpass-pp || { echo "Creating deployment directory..."; mkdir -p ~/northpass-pp; cd ~/northpass-pp; }

# Extract uploaded files if zip exists
if [ -f ~/northpass-deployment.zip ]; then
    echo "📦 Extracting deployment files..."
    unzip -o ~/northpass-deployment.zip
    rm ~/northpass-deployment.zip
    echo "✅ Files extracted"
fi

# Create server.js if it doesn't exist
if [ ! -f server.js ]; then
    echo "📝 Creating server.js..."
    cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Serve static files
app.use(express.static(__dirname, { 
    maxAge: '1d',
    etag: true 
}));

// SPA routing - serve index.html for all routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Northpass Partner Portal running on http://0.0.0.0:${PORT}`);
    console.log(`🌐 External access: http://20.125.24.28:${PORT}`);
    console.log(`📁 Serving from: ${__dirname}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    process.exit(0);
});
EOF
    echo "✅ server.js created"
fi

# Create package.json if it doesn't exist
if [ ! -f package.json ]; then
    echo "📝 Creating package.json..."
    cat > package.json << 'EOF'
{
  "name": "northpass-partner-portal-server",
  "version": "1.0.0",
  "description": "Static file server for Northpass Partner Portal",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
EOF
    echo "✅ package.json created"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Stop existing PM2 process if running
echo "🔄 Managing PM2 processes..."
pm2 stop northpass-portal 2>/dev/null || echo "No existing process to stop"
pm2 delete northpass-portal 2>/dev/null || echo "No existing process to delete"

# Start the application
echo "🚀 Starting application..."
pm2 start server.js --name northpass-portal

# Save PM2 configuration
pm2 save

# Show status
echo ""
echo "📊 Application Status:"
pm2 list

echo ""
echo "🎉 Deployment completed successfully!"
echo "🌐 Your application should be available at:"
echo "   http://20.125.24.28:3000"
echo ""
echo "📋 Management commands:"
echo "   pm2 logs northpass-portal    # View logs"
echo "   pm2 restart northpass-portal # Restart app"
echo "   pm2 stop northpass-portal    # Stop app"
echo ""
echo "🔍 Test the deployment:"
echo "   curl -I http://20.125.24.28:3000"