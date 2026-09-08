@echo off
rem ---------------------------------------------------------------------------
rem  Distant Sectors - one worktree per session.  See docs/worktrees.md
rem
rem    scripts\worktree new <name>    create ..\ds-work\<name> on branch work/<name>
rem    scripts\worktree list          show every worktree and its branch
rem    scripts\worktree done <name>   merge it into master, then remove it
rem
rem  Run from anywhere; the script finds the play tree from its own location.
rem ---------------------------------------------------------------------------
setlocal EnableDelayedExpansion

set "SCRIPTDIR=%~dp0"
for %%I in ("%SCRIPTDIR%..") do set "PLAY=%%~fI"
for %%I in ("%PLAY%\..\ds-work") do set "WORKROOT=%%~fI"

set "CMD=%~1"
set "NAME=%~2"

if /I "%CMD%"=="new"  goto :new
if /I "%CMD%"=="list" goto :list
if /I "%CMD%"=="done" goto :done
goto :usage

rem ---------------------------------------------------------------------------
:new
if "%NAME%"=="" echo ERROR: a name is required, e.g.  scripts\worktree new captains& goto :usage
set "WT=%WORKROOT%\%NAME%"
if exist "%WT%" echo ERROR: "%WT%" already exists.& exit /b 1

echo Creating worktree "%NAME%" on branch work/%NAME%
git -C "%PLAY%" worktree add "%WT%" -b "work/%NAME%"
if errorlevel 1 exit /b 1
echo.
echo   Folder : %WT%
echo   Branch : work/%NAME%
echo.
echo Tell the session to work in that folder. It starts from the last commit,
echo so anything uncommitted in the play tree is NOT there.
exit /b 0

rem ---------------------------------------------------------------------------
:list
git -C "%PLAY%" worktree list
exit /b 0

rem ---------------------------------------------------------------------------
:done
if "%NAME%"=="" echo ERROR: a name is required, e.g.  scripts\worktree done captains& goto :usage
set "WT=%WORKROOT%\%NAME%"
if not exist "%WT%" echo ERROR: no worktree at "%WT%".& exit /b 1

rem Refuse to merge a workspace with loose ends: uncommitted work would be lost
rem by the remove step below.
for /f "delims=" %%L in ('git -C "%WT%" status --porcelain') do (
  echo ERROR: "%NAME%" has uncommitted changes. Commit them in that worktree first,
  echo        staging explicit paths ^(never: git add -A^).
  exit /b 1
)

echo Merging work/%NAME% into master...
git -C "%PLAY%" merge --no-ff "work/%NAME%"
if errorlevel 1 (
  echo.
  echo MERGE CONFLICT. Nothing is lost. Ask the session that owns this slice to
  echo resolve it here in the play tree, then run this command again.
  exit /b 1
)

echo Removing the worktree and its branch...
git -C "%PLAY%" worktree remove "%WT%"
if errorlevel 1 exit /b 1
git -C "%PLAY%" branch -d "work/%NAME%"
echo.
echo Done. "%NAME%" is merged into master. Reload the game to see it.
exit /b 0

rem ---------------------------------------------------------------------------
:usage
echo.
echo   scripts\worktree new ^<name^>     create a session workspace
echo   scripts\worktree list           show all worktrees
echo   scripts\worktree done ^<name^>    merge it into master and clean up
echo.
echo   Play tree     : %PLAY%
echo   Worktrees in  : %WORKROOT%
echo   Documentation : docs\worktrees.md
exit /b 1
