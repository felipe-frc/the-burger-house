param(
    [ValidateSet('Start','Init','Api','Web','CopyOwnerPassword','OwnerCredentials')] [string] $Mode = 'Start',
    [string] $Python = 'python',
    [switch] $Offline
)
$ErrorActionPreference = 'Stop'
if ($Mode -eq 'OwnerCredentials') {
    if ([Console]::IsInputRedirected) { throw 'Use um terminal privado interativo para alterar as credenciais.' }
    $Offline = $true
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$root = Join-Path $repo '.test-tmp/burgerhouse-homologation-owner-test-portfolio'
$profileDir = Join-Path $repo '.test-tmp/portfolio-dev'
$profilePath = Join-Path $profileDir 'profile.xml'
$bundle = Join-Path $profileDir 'web'
. (Join-Path $PSScriptRoot 'local-runtime.ps1')
if ($Mode -eq 'Api') { Assert-LocalPortAvailable 55484 }
if ($Mode -eq 'Web') { Assert-LocalPortAvailable 55485 }
if ($Mode -eq 'Start') { Assert-LocalPortAvailable 55484; Assert-LocalPortAvailable 55485 }
function PrivateText([securestring] $secret) {
    return [Net.NetworkCredential]::new('', $secret).Password
}
function NewPrivateValue {
    return ConvertTo-SecureString ([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))) -AsPlainText -Force
}
function CheckExit([string] $operation) {
    if ($LASTEXITCODE -ne 0) { throw "$operation failed. See the preceding diagnostic." }
}
if (!$IsWindows) { throw 'This convenience launcher uses Windows DPAPI. See docs/postgresql-operacao.md for other platforms.' }
if ($Mode -eq 'Init' -and (Test-Path (Join-Path $profileDir 'imported.json'))) {
    throw 'Banco principal ja inicializado. Use -Mode Start. Init nao pode ser repetido neste perfil.'
}
if ($Mode -eq 'Init' -and !(Test-Path -LiteralPath $profilePath)) {
    if ($env:PGHOST -ne '127.0.0.1' -or $env:PGDATABASE -ne 'tbh_portfolio_dev' -or
        !$env:PGUSER -or !$env:PGPASSWORD -or $env:PGSERVICE -or $env:PGHOSTADDR) {
        throw 'Set private libpq credentials for the local tbh_portfolio_dev database.'
    }
    New-Item -Path $profileDir -ItemType Directory -Force | Out-Null
    [pscustomobject]@{
        Port = [int]$env:PGPORT
        User = $env:PGUSER
        DatabasePassword = ConvertTo-SecureString $env:PGPASSWORD -AsPlainText -Force
        EncryptionKey = NewPrivateValue
        OwnerPassword = NewPrivateValue
    } | Export-Clixml $profilePath -NoClobber
}
$profileData = Import-Clixml -LiteralPath $profilePath
if ($Mode -eq 'CopyOwnerPassword') {
    if (!$profileData.OwnerPassword) { throw 'Senha pessoal nao e armazenada no perfil. Use -Mode OwnerCredentials para redefinir.' }
    Set-Clipboard (PrivateText $profileData.OwnerPassword)
    Write-Output 'Senha local copiada. Limpe a área de transferência após entrar.'
    return
}
Set-Location $repo
if ([int]$profileData.Port -ne 55482 -or $profileData.User -ne 'tbh_portfolio_dev_role') {
    throw 'Perfil inesperado. Este launcher exige PostgreSQL local na porta 55482 e role tbh_portfolio_dev_role.'
}
$env:PGHOST = '127.0.0.1'
$env:PGDATABASE = 'tbh_portfolio_dev'
$env:PGPORT = [string]$profileData.Port
$env:PGUSER = $profileData.User
$env:PGPASSWORD = PrivateText $profileData.DatabasePassword
$env:PGOPTIONS = '-c search_path=public'
if ($env:PGSERVICE -or $env:PGHOSTADDR) { throw 'Unexpected libpq host override.' }
$settings = [System.Data.Common.DbConnectionStringBuilder]::new()
foreach ($pair in @{Host=$env:PGHOST;Port=$env:PGPORT;Database=$env:PGDATABASE;Username=$env:PGUSER;Password=$env:PGPASSWORD;'Search Path'='public'}.GetEnumerator()) {
    $settings[$pair.Key] = $pair.Value
}
$env:ConnectionStrings__DefaultConnection = $settings.ConnectionString
$env:Privacy__EncryptionKey = PrivateText $profileData.EncryptionKey
$env:Database__Provider = 'PostgreSQL'
$env:BURGER_BUILD_OUTPUT_DIR = $bundle
if ($Mode -eq 'Init') {
    Push-Location backend
    try {
        & dotnet tool run dotnet-ef database update --context PostgresContext --project BurgerHouse.Infrastructure --startup-project BurgerHouse.Api
        CheckExit 'PostgreSQL migrations'
        $source = Join-Path $root 'burgerhouse.homologation.db'
        if (!(Test-Path -LiteralPath $source)) {
            $env:HOMOLOGATION_OWNER_PASSWORD = PrivateText $profileData.OwnerPassword
            & dotnet run --project tools/HomologationFixture -- --owner-browser $root
            CheckExit 'Synthetic catalog, Owner and loopback certificate'
        }
    } finally { Pop-Location }
    if (!(Test-Path (Join-Path $profileDir 'imported.json'))) {
        $report = & $Python scripts/admin/import-sqlite-postgres.py $source --database tbh_portfolio_dev --sqlite-utc --truncate-ticks
        CheckExit 'Synthetic data import'
        $report | Set-Content (Join-Path $profileDir 'imported.json')
    }
    & $Python scripts/admin/seed-demo-catalog.py --apply
    CheckExit 'Explicit portfolio catalog seed'
    $env:BURGER_BUILD_API_ORIGIN = 'https://api.invalid'
    if (!(Test-Path (Join-Path $bundle 'config.json'))) {
        & npm.cmd run build:vercel
        CheckExit 'Local package'
    }
    & npm.cmd run verify:build
    CheckExit 'Local package validation'
    return
}
$env:HOMOLOGATION_ROOT = $root
$env:Portfolio__Enabled = 'true'
$env:PagBank__EnablePortfolioSandbox = if ($Offline) { 'false' } else { 'true' }
$env:PORTFOLIO_SANDBOX = if ($Offline) { '0' } else { '1' }
$env:HOMOLOGATION_DISABLE_CHECKOUT = if ($Offline) { '1' } else { '0' }
$env:HOMOLOGATION_API_PORT = '55484'
$env:HOMOLOGATION_GATEWAY_PORT = '55485'
$env:HOMOLOGATION_EXPECTED_DATABASE = 'tbh_portfolio_dev'
$env:ASPNETCORE_ENVIRONMENT = $env:DOTNET_ENVIRONMENT = 'Homologation'
$env:Homologation__Root = $root
$env:ASPNETCORE_URLS = 'http://127.0.0.1:55484'
$env:Admin__DataProtectionPath = Join-Path $profileDir 'data-protection'
$env:AZURE_TRANSLATION_ENABLED = 'false'
$env:PagBank__BaseUrl = 'https://sandbox.api.pagseguro.com'
$env:PagBank__RedirectUrl = 'https://127.0.0.1:55485/menu'
$env:PagBank__NotificationUrl = ' '
$env:PagBank__AllowUnsignedSandboxWebhooks = 'false'
$env:Logging__LogLevel__Default = 'Warning'
$env:PagBank__Token = 'offline-disabled'
if ($Mode -eq 'OwnerCredentials') {
    try {
        $apiPackage = New-LocalBuildPackage $repo
        & dotnet (Join-Path $apiPackage 'api/BurgerHouse.Api.dll') --contentRoot (Join-Path $apiPackage 'api') --update-owner-credentials
        CheckExit 'Alteracao interativa do Owner'
        # Never retain a reversible personal password, including in the DPAPI profile.
        $profileData.PSObject.Properties.Remove('OwnerPassword')
        $profileData | Export-Clixml -LiteralPath $profilePath
    } finally {
        Remove-Item Env:PGPASSWORD, Env:ConnectionStrings__DefaultConnection, Env:Privacy__EncryptionKey, Env:PagBank__Token -ErrorAction SilentlyContinue
    }
    return
}
if (!$Offline -and $Mode -ne 'Web') {
    $secretsPath = Join-Path $env:APPDATA 'Microsoft/UserSecrets/d52cfced-a3b4-4640-81e4-db29f9f29197/secrets.json'
    if (!(Test-Path $secretsPath)) { throw 'Configure sua credencial privada PagBank Sandbox. Consulte docs/portfolio-release-1.0.md ou use -Offline.' }
    $privateSettings = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json -AsHashtable
    if ($privateSettings['PagBank:BaseUrl'] -and $privateSettings['PagBank:BaseUrl'] -ne $env:PagBank__BaseUrl) { throw 'Origem privada PagBank nao e sandbox. Inicializacao recusada.' }
    $env:PagBank__Token = if ($privateSettings['PagBank:SandboxToken']) { $privateSettings['PagBank:SandboxToken'] } else { $privateSettings['PagBank:Token'] }
    if (!$env:PagBank__Token) { throw 'Credencial sandbox ausente. Use -Offline ou configure user-secrets.' }
    $privateSettings = $null
}
if ($Mode -eq 'Start') {
    & (Join-Path $PSScriptRoot 'local-https.ps1') -Mode Prepare
    foreach ($command in 'node','dotnet','npm.cmd') { if (!(Get-Command $command -ErrorAction SilentlyContinue)) { throw "Dependencia ausente: $command" } }
    if ([int]((& node --version).TrimStart('v').Split('.')[0]) -lt 24) { throw 'Node 24 ou superior requerido.' }
    if (!(& dotnet --list-runtimes | Select-String '^Microsoft.AspNetCore.App 9\.')) { throw '.NET 9 ASP.NET runtime requerido.' }
    $pg = [Net.Sockets.TcpClient]::new()
    try { $pg.Connect('127.0.0.1', [int]$profileData.Port) } catch { throw 'PostgreSQL indisponivel na porta do perfil (55482). Inicie seu servico existente.' } finally { $pg.Dispose() }
    $apiPackage = New-LocalBuildPackage $repo
    $bundle = Join-Path $repo ('test-results/local-runtime/web-' + [Guid]::NewGuid().ToString('N'))
    $env:BURGER_BUILD_OUTPUT_DIR = $bundle
    $env:BURGER_BUILD_API_ORIGIN = 'https://api.invalid'
    & npm.cmd run build:vercel
    CheckExit 'Build storefront e Owner'
    & npm.cmd run verify:build
    CheckExit 'Validacao do pacote web'
    $env:Portfolio__Supervised = 'true'
    $children = [Collections.Generic.List[Diagnostics.Process]]::new()
    function StartOwned([string] $Executable, [string[]] $Arguments) {
        $info = [Diagnostics.ProcessStartInfo]::new($Executable)
        $info.WorkingDirectory = $repo; $info.UseShellExecute = $false; $info.CreateNoWindow = $true; $info.RedirectStandardInput = $true
        foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
        if ($Executable -eq 'node') {
            foreach ($key in @($info.Environment.Keys)) { if ($key -match '^(PagBank__Token|Privacy__|ConnectionStrings__|PGPASSWORD|HOMOLOGATION_OWNER_PASSWORD)') { [void]$info.Environment.Remove($key) } }
        }
        $child = [Diagnostics.Process]::Start($info); $children.Add($child); return $child
    }
    try {
        Assert-LocalPortAvailable 55484; Assert-LocalPortAvailable 55485
        $apiChild = StartOwned 'dotnet' @((Join-Path $apiPackage 'api/BurgerHouse.Api.dll'), '--contentRoot', (Join-Path $apiPackage 'api'))
        $ready = $false
        for ($attempt=0; $attempt -lt 60; $attempt++) {
            if ($apiChild.HasExited) { throw 'API recusou inicializacao. Consulte o diagnostico seguro acima.' }
            try { $response = Invoke-WebRequest 'http://127.0.0.1:55484/health/ready' -TimeoutSec 2; $ready = $response.StatusCode -eq 204 } catch { }
            if ($ready) { break }; Start-Sleep -Milliseconds 500
        }
        if (!$ready) { throw 'API nao ficou pronta dentro do prazo.' }
        $gatewayChild = StartOwned 'node' @('scripts/serve-homologation.mjs')
        Write-Output 'The Burger House: https://127.0.0.1:55485/menu | Owner: https://127.0.0.1:55485/admin/'
        Write-Output 'Ctrl+C encerra somente os dois processos iniciados aqui. PostgreSQL permanece ativo.'
        while (!$apiChild.HasExited -and !$gatewayChild.HasExited) { Start-Sleep -Milliseconds 500 }
        throw 'Um processo local encerrou. O supervisor encerrara o outro.'
    }
    finally {
        foreach ($child in $children) {
            if (!$child.HasExited) {
                try { $child.StandardInput.WriteLine('stop'); $child.StandardInput.Flush() } catch { }
                if (!$child.WaitForExit(10000)) { $child.Kill($true); $child.WaitForExit() }
            }
            $child.Dispose()
        }
        Remove-Item Env:PGPASSWORD, Env:ConnectionStrings__DefaultConnection, Env:Privacy__EncryptionKey, Env:PagBank__Token -ErrorAction SilentlyContinue
    }
} elseif ($Mode -eq 'Web') {
    $env:HOMOLOGATION_API_PORT = '55484'
    $env:HOMOLOGATION_GATEWAY_PORT = '55485'
    $env:HOMOLOGATION_EXPECTED_DATABASE = 'tbh_portfolio_dev'
    & node scripts/serve-homologation.mjs
    CheckExit 'HTTPS gateway'
} else {
    $env:ASPNETCORE_ENVIRONMENT = $env:DOTNET_ENVIRONMENT = 'Homologation'
    $env:Homologation__Root = $root
    $env:ASPNETCORE_URLS = 'http://127.0.0.1:55484'
    $env:Admin__DataProtectionPath = Join-Path $profileDir 'data-protection'
    $env:AZURE_TRANSLATION_ENABLED = 'false'
    $env:PagBank__BaseUrl = 'https://sandbox.api.pagseguro.com'
    $env:PagBank__NotificationUrl = ' '
    $env:PagBank__AllowUnsignedSandboxWebhooks = 'false'
    $apiPackage = New-LocalBuildPackage $repo
    Assert-LocalPortAvailable 55484
    & dotnet (Join-Path $apiPackage 'api/BurgerHouse.Api.dll') --contentRoot (Join-Path $apiPackage 'api')
    CheckExit 'API'
}
