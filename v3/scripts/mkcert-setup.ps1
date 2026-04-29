<#
.SYNOPSIS
RNG Ops v3 — opt-in mkcert root-CA install + LAN-cert generation.

.DESCRIPTION
Installs the mkcert root CA into the Windows trust store (one-time per
host) and generates a TLS cert pair covering localhost, 127.0.0.1, the
auto-detected LAN IP of the host, and the operator-supplied (or default)
hostname. Writes the pair to v3/certs/cert.pem and v3/certs/key.pem.

Required for the eventual at-event deployment workflow where iPads on the
GL.iNet LAN connect to the host laptop over HTTPS so service workers can
register (PWA install, IndexedDB persistence, etc.).

.WHEN TO RUN
- Once during initial host-laptop setup.
- Again when changing event venues (different LAN IP) or when the cert
  has expired and needs regeneration. Use -Force to overwrite existing
  certs without prompting.

.WHEN NOT TO RUN
- Day-to-day development. Phase 1 dev.ps1 runs HTTP-only because
  localhost doesn't need TLS for service workers and the dev SW is
  intentionally skipped per sw-register.ts anyway.
- Inside CI / automation. The Read-Host CA-install confirmation is
  intentional friction — see the SIDE EFFECTS section.

.SIDE EFFECTS
- mkcert -install modifies the Windows trust store (system-level change).
  Triggers a UAC elevation prompt on first run. The Read-Host prompt
  before this is intentional; -Force bypasses it.
- Generated certs are written to v3/certs/. Path is gitignored at the
  repo level (.gitignore: certs/ and *.pem).

.HOW TO UNDO
- Remove the trust-store entry: run `mkcert -uninstall` (clean reverse).
- Delete v3/certs/cert.pem and v3/certs/key.pem to drop the leaf certs.

.HOW TO RUN
From the repo root or v3/ directory:
    pwsh.exe -File v3\scripts\mkcert-setup.ps1
    pwsh.exe -File v3\scripts\mkcert-setup.ps1 -Hostname twilight-host.local
    pwsh.exe -File v3\scripts\mkcert-setup.ps1 -Force
If your box has Restricted execution policy:
    pwsh.exe -ExecutionPolicy Bypass -File v3\scripts\mkcert-setup.ps1

.PARAMETER Hostname
LAN-friendly hostname to include as a SubjectAltName. Default = the
Windows machine name ($env:COMPUTERNAME). Override for venues where
the host is reachable under a custom name (e.g. via the GL.iNet
router's local DNS).

.PARAMETER Force
Skip the Read-Host CA-install confirmation. Also overwrites existing
v3/certs/cert.pem / key.pem without prompting. Intended for re-runs
where the operator has already confirmed the trust-store change in a
prior session.
#>

param(
    [string]$Hostname = $env:COMPUTERNAME,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Paths anchored from the script's own location so the script works
# regardless of where the operator's shell is sitting.
$scriptRoot = $PSScriptRoot
$v3Root     = Split-Path -Parent $scriptRoot
$certsDir   = Join-Path $v3Root 'certs'
$certPath   = Join-Path $certsDir 'cert.pem'
$keyPath    = Join-Path $certsDir 'key.pem'

# 1. Locate mkcert. Per project setup history mkcert lives at
#    C:\Tools\mkcert.exe — we check PATH first (covers PATH-installed
#    mkcert) and fall back to the canonical Tools path.
$mkcert = Get-Command mkcert -ErrorAction SilentlyContinue
if (-not $mkcert) {
    $candidate = 'C:\Tools\mkcert.exe'
    if (Test-Path $candidate) {
        $mkcert = Get-Command $candidate
    }
}
if (-not $mkcert) {
    Write-Host "ERROR: mkcert not found on PATH or at C:\Tools\mkcert.exe." -ForegroundColor Red
    Write-Host "Install mkcert first: https://github.com/FiloSottile/mkcert/releases" -ForegroundColor Red
    Write-Host "Then re-run this script."
    exit 1
}
Write-Host "Using mkcert at: $($mkcert.Source)"

# 2. Auto-detect the host's LAN IPv4 address.
#    Filter: Preferred state, DHCP or Manual origin, exclude loopback
#    and link-local (169.254.x.x). Picks the first match. For multi-NIC
#    hosts (VPN active, Hyper-V virtual switches, etc.) the operator
#    can re-run with the desired hostname or edit the cert after.
$lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue `
    | Where-Object {
        ($_.PrefixOrigin -eq 'Dhcp' -or $_.PrefixOrigin -eq 'Manual') -and
        $_.AddressState -eq 'Preferred' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.IPAddress -ne '127.0.0.1'
      } `
    | Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $lanIp) {
    Write-Host "WARNING: No LAN IPv4 found. Cert will cover localhost + 127.0.0.1 only." -ForegroundColor Yellow
    Write-Host "Re-run this script at the event venue once the GL.iNet router is up." -ForegroundColor Yellow
}

# 3. Confirm the trust-store change unless -Force.
if (-not $Force) {
    Write-Host ""
    Write-Host "About to install the mkcert local CA into your Windows trust store." -ForegroundColor Yellow
    Write-Host "UAC will prompt. The CA is required for iPads on the LAN to trust" -ForegroundColor Yellow
    Write-Host "generated certs." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "If the CA is already installed (run on this box previously), this is" -ForegroundColor Yellow
    Write-Host "a no-op and will not re-prompt UAC."                                  -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "Continue? [y/N]"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Aborted." -ForegroundColor Red
        exit 0
    }
}

# 4. Install the root CA.
Write-Host ""
Write-Host "Running mkcert -install ..."
& $mkcert.Source -install
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: mkcert -install exited with code $LASTEXITCODE." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 5. Idempotency: if certs already exist and -Force not set, skip generation.
if ((Test-Path $certPath) -and (Test-Path $keyPath) -and -not $Force) {
    Write-Host ""
    Write-Host "Certs already exist at v3/certs/. Pass -Force to regenerate." -ForegroundColor Yellow
    Write-Host "Existing cert: $certPath"
    Write-Host "Existing key:  $keyPath"
    exit 0
}

# 6. Generate the leaf cert.
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
}

$sanList = @('localhost', '127.0.0.1')
if ($lanIp)    { $sanList += $lanIp }
if ($Hostname) { $sanList += $Hostname }

Write-Host ""
Write-Host "Generating cert with SANs: $($sanList -join ', ')"
& $mkcert.Source -cert-file $certPath -key-file $keyPath @sanList
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: mkcert cert generation exited with code $LASTEXITCODE." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 7. Print summary.
Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host "  cert: $certPath"
Write-Host "  key:  $keyPath"
Write-Host "  SANs: $($sanList -join ', ')"
Write-Host ""
Write-Host "To verify cert details:"
Write-Host ("  `$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 '$certPath'")
Write-Host '  $c.Subject; $c.Extensions | ForEach-Object { $_.Format($true) }'
