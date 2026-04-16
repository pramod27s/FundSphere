@echo off
echo Starting FundSphere Smart Scraper...
cd /d "%~dp0"

:: Activate your virtual environment if you have one (uncomment the line below if using venv)
:: call venv\Scripts\activate

:: Run the smart scheduler script
python smart_scheduler.py

echo Scraper finished.

