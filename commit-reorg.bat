@echo off
REM ============================================================
REM  Commit + push the Sutra file reorganization
REM  Double-click this file, or run it from a terminal.
REM ============================================================

cd /d "D:\Desktop\coding\Sutra"

echo Setting line-ending mode so only real changes are staged...
git config core.autocrlf input

echo.
echo Staging changes...
git add -A

echo.
echo ============================================================
echo  Review the changes below. You should see the renamed
echo  folders/files and a handful of edited files, NOT the whole
echo  repo. If it looks wrong, close this window (changes are
echo  only staged, nothing is committed yet).
echo ============================================================
echo.
git status

echo.
pause

git commit -m "Reorganize assets and folders with clearer names; update internal references"

echo.
echo Pushing to GitHub...
git push

echo.
echo Done.
pause
