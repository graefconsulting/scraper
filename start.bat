@echo off
echo ===================================================
echo               Idealo Scraper Starter               
echo ===================================================
echo.
echo Starte Backend (Scraper API) im Hintergrund...
start "Idealo Backend" cmd /k "cd idealo_scraper && node scraper.js"

echo Starte Frontend (React UI)...
start "Idealo Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ===================================================
echo   Beide Systeme werden gestartet!
echo   Das Frontend sollte sich gleich im Browser oeffnen.
echo   (Falls nicht, oeffne: http://localhost:5173 oder 5174)
echo ===================================================
echo.
pause
