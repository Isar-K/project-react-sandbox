#!/bin/bash
# VPS Setup Script for AIS Vessel Tracker

set -e  # Exit on error

echo "=================================="
echo "AIS Vessel Tracker - VPS Setup"
echo "=================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Update system
echo "Updating system packages..."
apt update && apt upgrade -y

# Install dependencies
echo "Installing dependencies..."
apt install -y python3 python3-pip python3-venv git nginx supervisor sqlite3

# Create application directory
APP_DIR="/var/www/apihub"
echo "Setting up application directory: $APP_DIR"

if [ ! -d "$APP_DIR" ]; then
    mkdir -p $APP_DIR
fi

cd $APP_DIR

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python packages
echo "Installing Python packages..."
pip install --upgrade pip
pip install websocket-client flask flask-socketio

# Set permissions
echo "Setting permissions..."
chown -R www-data:www-data $APP_DIR
chmod 755 $APP_DIR

# Create log directory
mkdir -p /var/log/ais-tracker
chown www-data:www-data /var/log/ais-tracker

echo ""
echo "=================================="
echo "Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Clone your repository to $APP_DIR"
echo "2. Create api.txt with your AISStream API key"
echo "3. Configure supervisor (see DEPLOYMENT.md)"
echo "4. Configure nginx (see DEPLOYMENT.md)"
echo ""
echo "For detailed instructions, see DEPLOYMENT.md"
echo "=================================="
