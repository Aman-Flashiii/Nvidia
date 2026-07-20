# ==============================================================================
# run_all.ps1 - One-shot launcher for the p-Adic Ultrametric Vector Search
#
# Usage (open PowerShell, cd to c:\e\Parth\Nvidia, then):
#   .\run_all.ps1                        # full build + start both
#   .\run_all.ps1 -SkipBuild             # skip cmake/build, just start
#   .\run_all.ps1 -Port 9000             # custom backend port
#   .\run_all.ps1 -CudaArch 86           # RTX 30xx=86, RTX 40xx=89, A100=80
#   .\run_all.ps1 -Dataset "data\v.bin"  # load binary dataset at startup
# ==============================================================================
param(
    [switch] $SkipBuild,
    [int]    $Port     = 8080,
    [string] $CudaArch = "80",
    [string] $Dataset  = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
$ROOT         = Split-Path -Parent $MyInvocation.MyCommand.Path
$BACKEND_DIR  = Join-Path $ROOT "Backend nvidia\Backend nvidia"
$FRONTEND_DIR = Join-Path $ROOT "frontend\frontend"
$BUILD_DIR    = Join-Path $BACKEND_DIR "build"

# Use the standalone CMake (not MinGW's cmake which uses MinGW linker)
$CMAKE = "C:\Program Files\CMake\bin\cmake.exe"
$VCVARS = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
function Info  ([string]$m) { Write-Host "  [INFO ] $m" -ForegroundColor Cyan   }
function Ok    ([string]$m) { Write-Host "  [ OK  ] $m" -ForegroundColor Green  }
function Warn  ([string]$m) { Write-Host "  [WARN ] $m" -ForegroundColor Yellow }
function Err   ([string]$m) { Write-Host "  [ERROR] $m" -ForegroundColor Red    }
function Banner([string]$m) {
    Write-Host ""
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Host "  $m" -ForegroundColor White
    Write-Host ("-" * 70) -ForegroundColor DarkGray
}

# ---------------------------------------------------------------------------
# Child-process tracking for Ctrl+C cleanup
# ---------------------------------------------------------------------------
$script:BackendProc  = $null
$script:FrontendProc = $null

function Cleanup {
    Banner "Shutting down..."
    if ($script:FrontendProc -and -not $script:FrontendProc.HasExited) {
        Info "Stopping Next.js  (PID $($script:FrontendProc.Id))..."
        Stop-Process -Id $script:FrontendProc.Id -Force -ErrorAction SilentlyContinue
        Ok "Next.js stopped."
    }
    if ($script:BackendProc -and -not $script:BackendProc.HasExited) {
        Info "Stopping backend  (PID $($script:BackendProc.Id))..."
        Stop-Process -Id $script:BackendProc.Id -Force -ErrorAction SilentlyContinue
        Ok "Backend stopped."
    }
    Write-Host ""
}

Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Cleanup } | Out-Null
trap { Cleanup; break }

# ===========================================================================
Banner "p-Adic Ultrametric Vector Search  -  Launcher"
# ===========================================================================

# ---------------------------------------------------------------------------
# Step 1: Build C++ backend via MSVC + CUDA
# ---------------------------------------------------------------------------
if ($SkipBuild) {
    Warn "Skipping build (-SkipBuild flag set)."
} else {
    Banner "Step 1/3 - Building C++ backend  (CUDA sm_$CudaArch)"

    if (-not (Test-Path $CMAKE)) {
        Err "CMake not found at: $CMAKE"
        Err "Install CMake from https://cmake.org/download/"
        exit 1
    }
    if (-not (Test-Path $VCVARS)) {
        Err "VS 2022 BuildTools not found at:"
        Err "  $VCVARS"
        Err "Install from https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022"
        exit 1
    }

    # Delete stale CMake cache so a fresh configure runs with the right compiler
    if (Test-Path $BUILD_DIR) {
        $cacheFile = Join-Path $BUILD_DIR "CMakeCache.txt"
        if (Test-Path $cacheFile) {
            Info "Removing stale CMakeCache.txt..."
            Remove-Item $cacheFile -Force
        }
    }

    # Build the command string to run inside cmd.exe with MSVC environment.
    # Use "NMake Makefiles" generator so MSVC's nmake (not MinGW ninja) is used.
    $bd    = $BUILD_DIR -replace "\\", "/"
    $bkdir = $BACKEND_DIR -replace "\\", "/"
    $cmakeCfg   = "`"$CMAKE`" -S `"$bkdir`" -B `"$bd`" -G `"NMake Makefiles`" -DCMAKE_BUILD_TYPE=Release -DCMAKE_CUDA_ARCHITECTURES=$CudaArch"
    $cmakeBuild = "`"$CMAKE`" --build `"$bd`" --config Release"
    $fullCmd    = "`"$VCVARS`" && $cmakeCfg && $cmakeBuild"

    Info "Configuring + building (first run can take 5-10 min)..."
    cmd.exe /c $fullCmd
    if ($LASTEXITCODE -ne 0) {
        Err "Build failed (exit $LASTEXITCODE). See output above."
        exit 1
    }
    Ok "Backend built successfully."
}

# ---------------------------------------------------------------------------
# Step 2: Start C++ backend
# ---------------------------------------------------------------------------
Banner "Step 2/3 - Starting C++ backend on port $Port"

$EXE = Join-Path $BUILD_DIR "padic_search.exe"
if (-not (Test-Path $EXE)) { $EXE = Join-Path $BUILD_DIR "Release\padic_search.exe" }

if (-not (Test-Path $EXE)) {
    Err "Executable not found: $EXE"
    Err "Try running without -SkipBuild."
    exit 1
}

$backendArgs = @("--port", "$Port", "--host", "0.0.0.0")
if ($Dataset -ne "" -and (Test-Path $Dataset)) {
    $backendArgs += @("--dataset", $Dataset)
    Info "Loading dataset: $Dataset"
}

Info "Starting: $EXE"
$script:BackendProc = Start-Process `
    -FilePath  $EXE `
    -ArgumentList $backendArgs `
    -PassThru `
    -NoNewWindow

Start-Sleep -Seconds 2

if ($script:BackendProc.HasExited) {
    Err "Backend exited immediately (code $($script:BackendProc.ExitCode))."
    Err "Check CUDA drivers and that port $Port is free."
    exit 1
}
Ok "Backend running  - PID $($script:BackendProc.Id)   ->  http://localhost:$Port"

# ---------------------------------------------------------------------------
# Step 3: Start Next.js frontend
# ---------------------------------------------------------------------------
Banner "Step 3/3 - Starting Next.js frontend"

if (-not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Err "npm not found. Install Node.js from https://nodejs.org"
    Cleanup; exit 1
}

$envLocal   = Join-Path $FRONTEND_DIR ".env.local"
$envContent = "BACKEND_URL=http://localhost:$Port`nNEXT_PUBLIC_API_BASE_URL="
Set-Content -Path $envLocal -Value $envContent -Encoding UTF8
Info ".env.local -> BACKEND_URL=http://localhost:$Port"

if (-not (Test-Path (Join-Path $FRONTEND_DIR "node_modules"))) {
    Info "Running npm install (first run only)..."
    Push-Location $FRONTEND_DIR
    & npm install
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Err "npm install failed."; Cleanup; exit 1 }
    Ok "npm install complete."
}

$script:FrontendProc = Start-Process `
    -FilePath     "npm.cmd" `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory $FRONTEND_DIR `
    -PassThru `
    -NoNewWindow


Start-Sleep -Seconds 5

if ($script:FrontendProc.HasExited) {
    Err "Next.js exited immediately."
    Cleanup; exit 1
}
Ok "Next.js running  - PID $($script:FrontendProc.Id)   ->  http://localhost:3000"

# ---------------------------------------------------------------------------
# Ready
# ---------------------------------------------------------------------------
Banner "All systems go!"
Write-Host ""
Write-Host "  Frontend  ->  " -NoNewline; Write-Host "http://localhost:3000" -ForegroundColor Green
Write-Host "  Backend   ->  " -NoNewline; Write-Host "http://localhost:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press Ctrl+C to stop both servers."
Write-Host ""

try {
    while ($true) {
        Start-Sleep -Seconds 3
        if ($script:BackendProc.HasExited) {
            Warn "Backend exited unexpectedly (code $($script:BackendProc.ExitCode))."
            break
        }
        if ($script:FrontendProc.HasExited) {
            Warn "Next.js exited unexpectedly (code $($script:FrontendProc.ExitCode))."
            break
        }
    }
} finally {
    Cleanup
}
