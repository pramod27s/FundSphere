@echo off
REM ===========================================================================
REM  FundSphere RAG Eval launcher (LLM-based).
REM
REM  One-click measurement of recommender quality. The test set (profiles +
REM  queries) is frozen on first run and the LLM judgments are cached, so only
REM  the FIRST run spends tokens — every run after is effectively free.
REM
REM  Preflight: refuses to run unless BOTH CoreBackend and the ai-service are
REM  reachable (otherwise the eval would fall back to synthetic data and waste
REM  tokens on a meaningless result).
REM ===========================================================================
setlocal
cd /d "%~dp0"

REM Service URLs (override here if you use non-default ports).
set "COREBACKEND_URL=http://localhost:8080"
set "AISERVICE_URL=http://localhost:8000"

REM Prefer the project venv; fall back to system python.
set "PY=.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

:menu
echo.
echo ============================================================
echo    FundSphere RAG Eval  (LLM-based, cached)
echo ============================================================
echo    [1] Compare: flags OFF vs improved ON   (recommended)
echo    [2] Single run (current settings)
echo    [3] Refresh test set  (regenerate profiles+queries - costs tokens)
echo    [4] Auto-tune weights  (sweep + recommend best - no tokens)
echo    [5] Quit
echo.
set "choice="
set /p "choice=Choose [1-5]: "

if "%choice%"=="1" goto compare
if "%choice%"=="2" goto single
if "%choice%"=="3" goto refresh
if "%choice%"=="4" goto tune
if "%choice%"=="5" goto end
echo   Invalid choice, try again.
goto menu

:compare
call :preflight
if errorlevel 1 goto menu
echo.
echo Running baseline-vs-improved comparison...
"%PY%" -m eval.auto_eval --compare --save "eval\report_compare.json"
goto done

:single
call :preflight
if errorlevel 1 goto menu
echo.
echo Running single eval with current settings...
"%PY%" -m eval.auto_eval --save "eval\report_single.json"
goto done

:refresh
call :preflight
if errorlevel 1 goto menu
echo.
echo Regenerating the frozen test set (this WILL spend tokens)...
"%PY%" -m eval.auto_eval --refresh --compare --save "eval\report_compare.json"
goto done

:tune
REM Tuning reuses the cached snapshot + labels when present (no services
REM needed). It only contacts Pinecone/CoreBackend if it has to build the
REM snapshot for the first time, and errors clearly if they're unavailable.
echo.
echo Auto-tuning weights (sweeping over cached signals + labels)...
"%PY%" -m eval.tune --save "eval\tune_result.json"
goto done

:done
echo.
echo Done. Report written under eval\ . Press any key to return to the menu.
pause >nul
goto menu

REM ---------------------------------------------------------------------------
REM  Preflight: returns errorlevel 1 if a required service is unreachable.
REM  curl exits non-zero only on transport failure (connection refused / DNS /
REM  timeout); any HTTP response (even 401/404) means the service is up.
REM ---------------------------------------------------------------------------
:preflight
echo.
echo Checking services...
curl -s -o NUL --max-time 5 "%COREBACKEND_URL%/api/grants"
if errorlevel 1 (
    echo   [X] CoreBackend NOT reachable at %COREBACKEND_URL%
    echo       Start CoreBackend first, then try again.
    exit /b 1
)
curl -s -o NUL --max-time 5 "%AISERVICE_URL%"
if errorlevel 1 (
    echo   [X] ai-service NOT reachable at %AISERVICE_URL%
    echo       Start the ai-service (uvicorn) first, then try again.
    exit /b 1
)
echo   [OK] CoreBackend and ai-service are up.
exit /b 0

:end
endlocal
