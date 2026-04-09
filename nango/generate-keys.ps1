# Nango Key Generation Script (PowerShell)
# Generates all required keys for Nango setup

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  NANGO KEY GENERATION" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Generate Secret Key (32+ characters)
Write-Host "1. Generating NANGO_SECRET_KEY..." -ForegroundColor Yellow
$secretKey = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
$secretKeyHex = -join ((0..9) + ('a'..'f') | Get-Random -Count 64)
Write-Host "   NANGO_SECRET_KEY=$secretKeyHex" -ForegroundColor Green
Write-Host ""

# Generate Public Key (32+ characters)
Write-Host "2. Generating NANGO_PUBLIC_KEY..." -ForegroundColor Yellow
$publicKeyHex = -join ((0..9) + ('a'..'f') | Get-Random -Count 64)
Write-Host "   NANGO_PUBLIC_KEY=$publicKeyHex" -ForegroundColor Green
Write-Host ""

# Generate Encryption Key (must be exactly 32 characters)
Write-Host "3. Generating NANGO_ENCRYPTION_KEY (32 chars)..." -ForegroundColor Yellow
$encryptionKeyHex = -join ((0..9) + ('a'..'f') | Get-Random -Count 32)
Write-Host "   NANGO_ENCRYPTION_KEY=$encryptionKeyHex" -ForegroundColor Green
Write-Host ""

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  COPY THESE TO YOUR .env FILES" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "# Add to nango/.env:" -ForegroundColor Yellow
Write-Host "NANGO_SECRET_KEY=$secretKeyHex"
Write-Host "NANGO_PUBLIC_KEY=$publicKeyHex"
Write-Host "NANGO_ENCRYPTION_KEY=$encryptionKeyHex"
Write-Host "NANGO_SERVER_URL=http://localhost:3003"
Write-Host ""
Write-Host "# Add to your main project .env:" -ForegroundColor Yellow
Write-Host "NANGO_SECRET_KEY=$secretKeyHex"
Write-Host "NANGO_SERVER_URL=http://localhost:3003"
Write-Host "NEXT_PUBLIC_NANGO_PUBLIC_KEY=$publicKeyHex"
Write-Host "NEXT_PUBLIC_NANGO_SERVER_URL=http://localhost:3003"
Write-Host "NANGO_ENCRYPTION_KEY=$encryptionKeyHex"
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan

