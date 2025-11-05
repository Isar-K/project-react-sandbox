@echo off
echo ========================================
echo AIS Vessel Data Collector
echo ========================================
echo.
echo Starting collector...
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0"
hub\Scripts\python.exe ais_collector.py

pause
