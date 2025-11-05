#!/bin/bash
# Setup automatic cleanup for AIS vessel tracker
# This prevents disk space issues by:
# 1. Cleaning old position data daily
# 2. Rotating logs properly
# 3. Monitoring disk usage

echo "🔧 Setting up automatic cleanup for AIS Vessel Tracker"
echo "========================================================"

# 1. Setup log rotation
echo ""
echo "📋 Step 1: Setting up log rotation..."
sudo cp logrotate-ais.conf /etc/logrotate.d/ais-tracker
sudo chmod 644 /etc/logrotate.d/ais-tracker
echo "✅ Log rotation configured"
echo "   - Syslog rotates daily, keeps 3 days, max 100MB"
echo "   - Auth log rotates daily, keeps 3 days, max 50MB"

# 2. Test log rotation
echo ""
echo "🧪 Step 2: Testing log rotation..."
sudo logrotate -f /etc/logrotate.d/ais-tracker
echo "✅ Log rotation tested"

# 3. Setup daily database cleanup cron job
echo ""
echo "⏰ Step 3: Setting up daily database cleanup..."
CRON_JOB="0 3 * * * cd /var/www/apihub && /var/www/apihub/venv/bin/python /var/www/apihub/cleanup_database.py >> /var/log/ais-cleanup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "cleanup_database.py"; then
    echo "⚠️  Cron job already exists, skipping..."
else
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "✅ Cron job added (runs daily at 3 AM)"
fi

# 4. Create initial cleanup log
echo ""
echo "📝 Step 4: Creating cleanup log file..."
sudo touch /var/log/ais-cleanup.log
sudo chown erik:erik /var/log/ais-cleanup.log
echo "✅ Log file created: /var/log/ais-cleanup.log"

# 5. Run initial cleanup
echo ""
echo "🧹 Step 5: Running initial database cleanup..."
cd /var/www/apihub
/var/www/apihub/venv/bin/python cleanup_database.py

# 6. Show current disk usage
echo ""
echo "💾 Current Disk Usage:"
df -h / | grep -v Filesystem

# 7. Show cron jobs
echo ""
echo "⏰ Scheduled Cleanup Jobs:"
crontab -l | grep cleanup_database.py

echo ""
echo "========================================================"
echo "✅ Automatic cleanup setup complete!"
echo ""
echo "What happens now:"
echo "  • Database cleanup runs daily at 3 AM"
echo "  • Keeps last 7 days of position data"
echo "  • Logs rotate daily (max 100MB)"
echo "  • Old logs compressed automatically"
echo ""
echo "Manual cleanup:"
echo "  python cleanup_database.py"
echo ""
echo "Check cleanup logs:"
echo "  tail -f /var/log/ais-cleanup.log"
echo "========================================================"
