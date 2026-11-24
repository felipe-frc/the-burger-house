param(
    [ValidateSet('CheckAccess', 'Apply')]
    [string]$Mode = 'CheckAccess'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$reportPath = Join-Path $projectRoot 'test-results/production-catalog-registration.json'
$oldOrigin = $env:BURGER_API_ORIGIN
$oldEmail = $env:BURGER_ADMIN_EMAIL
$oldPassword = $env:BURGER_ADMIN_PASSWORD
$pointer = [IntPtr]::Zero
$password = $null
try {
    Set-Location -LiteralPath $projectRoot
    [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $reportPath))
    @{ status = 'awaiting-private-login'; startedAt = [DateTime]::UtcNow.ToString('o'); created = @(); requests = @() } |
        ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding utf8
    Write-Host 'The Burger House - acesso administrativo privado'
    Write-Host 'API: the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net'
    Write-Host 'Nao executa reset, migrations, deploy, pagamentos ou alteracao de produtos existentes.'
    $env:BURGER_API_ORIGIN = 'https://the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net'
    $env:BURGER_ADMIN_EMAIL = Read-Host 'E-mail do proprietario'
    $password = Read-Host 'Senha existente (oculta)' -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $env:BURGER_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $arguments = @('scripts/admin/register-missing-products.mjs', "--report=$reportPath")
    if ($Mode -eq 'Apply') { $arguments += @('--apply', '--allow-production') }
    else { $arguments += '--check-access' }
    & node @arguments
    $result = $LASTEXITCODE
    Write-Host "Relatorio sem credenciais: $reportPath"
    if ($result -ne 0) { Write-Host 'Operacao interrompida. Nao repita tentativas de senha nem execute reset sem autorizacao.' }
}
finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($null -ne $password) { $password.Dispose() }
    $env:BURGER_API_ORIGIN = $oldOrigin
    $env:BURGER_ADMIN_EMAIL = $oldEmail
    $env:BURGER_ADMIN_PASSWORD = $oldPassword
}
