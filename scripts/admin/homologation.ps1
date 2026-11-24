[CmdletBinding()]
param(
    [ValidateSet('Prepare','Refresh','Start','Web','Verify','Access','CopyOwnerPassword','CheckOwner','CheckLocalOwner')][string]$Mode = 'Verify',
    [string]$PublicOrigin,
    [string]$WebhookOrigin,
    [switch]$LocalCheckout,
    [string]$ApiBuildDirectory,
    [string]$WebBuildDirectory,
    [switch]$NewEnvironment
)
$ErrorActionPreference='Stop'
if ($LocalCheckout -and ($Mode -ne 'Start' -or $PublicOrigin -or $WebhookOrigin)) {
    throw '-LocalCheckout requer Start sem origens publicas.'
}
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$pointerFile=Join-Path $projectRoot 'test-results/acceptance/homologation-path.txt'
. (Join-Path $PSScriptRoot 'local-runtime.ps1')
if ($NewEnvironment -and $Mode -ne 'Prepare') { throw '-NewEnvironment requer Prepare.' }
if ($WebBuildDirectory -and $Mode -ne 'Web') { throw '-WebBuildDirectory requer Web.' }
if ($Mode -eq 'Web') { Assert-LocalPortAvailable 4174 }
if ($Mode -eq 'Prepare') {
    if ((Test-Path $pointerFile) -and !$NewEnvironment) { throw 'Ambiente ja preparado. Use -NewEnvironment para criar outro sem apagar o anterior.' }
    $package=New-LocalBuildPackage $projectRoot
    $fixture=Join-Path $package 'fixture/HomologationFixture.dll'
    $root=Join-Path $projectRoot ('test-results/acceptance/burgerhouse-homologation-'+[Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($root)
    $privacy=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    $password='Hml-'+[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    # Windows DPAPI: only this signed-in user can decrypt these local test secrets.
    $private=@{privacy=($privacy|ConvertTo-SecureString -AsPlainText -Force|ConvertFrom-SecureString);owner=($password|ConvertTo-SecureString -AsPlainText -Force|ConvertFrom-SecureString)}
    $private|ConvertTo-Json|Set-Content (Join-Path $root 'private.dpapi.json') -Encoding utf8
    $snapshot=Join-Path $root 'public-catalog.json'
    # Offline synthetic catalog: preparation never reads production or the portfolio database.
    $catalog=Get-Content -Raw (Join-Path $projectRoot 'scripts/admin/demo-catalog.json')|ConvertFrom-Json
    if (!$catalog.synthetic -or $catalog.products.Count -ne 15) { throw 'Catalogo sintetico de 15 produtos requerido.' }
    $finalCatalog=@($catalog.products | ForEach-Object { $_ | Add-Member -NotePropertyName isActive -NotePropertyValue $true -PassThru -Force })
    $finalCatalog|ConvertTo-Json -Depth 8|Set-Content $snapshot -Encoding utf8
    try {
        $env:Privacy__EncryptionKey=$privacy; $env:HOMOLOGATION_OWNER_PASSWORD=$password
        & dotnet $fixture --prepare $root $snapshot
        if ($LASTEXITCODE -ne 0) { throw 'Falha ao preparar banco isolado.' }
        & dotnet $fixture --verify $root
        if ($LASTEXITCODE -ne 0) { throw 'Banco novo incompativel com o pacote atual.' }
        [IO.File]::WriteAllText((Join-Path $root 'build-package.txt'),$package)
        [void][IO.Directory]::CreateDirectory((Split-Path $pointerFile))
        [IO.File]::WriteAllText($pointerFile,$root)
        [pscustomobject]@{status='prepared';environment='Homologation';root=$root;productionTouched=$false}
    } finally {Remove-Item Env:Privacy__EncryptionKey,Env:HOMOLOGATION_OWNER_PASSWORD -ErrorAction SilentlyContinue;$privacy=$null;$password=$null;$private=$null}
    return
}
if (!(Test-Path $pointerFile)) {throw 'Prepare primeiro o ambiente isolado.'}
$root=[IO.File]::ReadAllText($pointerFile).Trim()
$root=[IO.Path]::GetFullPath($root)
$allowed=[IO.Path]::GetFullPath((Join-Path $projectRoot 'test-results/acceptance'))+[IO.Path]::DirectorySeparatorChar
if (!$root.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path $root -Leaf).StartsWith('burgerhouse-homologation-')) {throw 'Diretorio isolado invalido.'}
if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Diretorio isolado nao pode ser um link.' }
$private=Get-Content -Raw (Join-Path $root 'private.dpapi.json')|ConvertFrom-Json
function Read-Private([string]$encrypted) {
    $secure=ConvertTo-SecureString $encrypted
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer);$secure.Dispose()}
}
if ($Mode -eq 'CopyOwnerPassword') {
    Set-Clipboard (Read-Private $private.owner)
    Write-Output 'Senha do Owner isolado copiada. Limpe a area de transferencia apos entrar.'
    return
}
if ($Mode -eq 'Access') {
    # Run this mode ONLY in the user's separate private terminal, never in agent logs.
    if ([Console]::IsOutputRedirected) {throw 'Use uma janela privada interativa.'}
    $Host.UI.RawUI.WindowTitle='Burger House — Owner de homologacao (privado)'
    Write-Host 'OWNER EXCLUSIVO DE HOMOLOGACAO — NAO E O ACESSO DE PRODUCAO'
    Write-Host 'E-mail: owner.homologation@example.invalid'
    Write-Host ('Senha de teste: '+(Read-Private $private.owner))
    return
}
if ($Mode -in @('CheckOwner','CheckLocalOwner')) {
    try {
        $env:HOMOLOGATION_OWNER_PASSWORD=Read-Private $private.owner
        Set-Location -LiteralPath $projectRoot
        $verificationScript = if ($Mode -eq 'CheckLocalOwner') {'scripts/verify-owner-homologation.mjs'} else {'scripts/verify-owner-final.mjs'}
        & node $verificationScript
        if ($LASTEXITCODE -ne 0) {throw 'Verificacao Owner de homologacao falhou.'}
    } finally {Remove-Item Env:HOMOLOGATION_OWNER_PASSWORD -ErrorAction SilentlyContinue;$private=$null}
    return
}
$packagePointer=Join-Path $root 'build-package.txt'
if ($Mode -eq 'Refresh') {
    # Rebuild the current source without recreating the existing database or its credentials.
    $package=New-LocalBuildPackage $projectRoot
    $savedKey=$env:Privacy__EncryptionKey
    try {
        $env:Privacy__EncryptionKey=Read-Private $private.privacy
        & dotnet (Join-Path $package 'fixture/HomologationFixture.dll') --verify $root
        if ($LASTEXITCODE -ne 0) { throw 'Pacote atual incompativel. Banco e ponteiro existentes foram preservados.' }
        [IO.File]::WriteAllText($packagePointer,$package)
        [pscustomobject]@{status='refreshed';root=$root;databaseRecreated=$false;credentialsChanged=$false}
    } finally { $env:Privacy__EncryptionKey=$savedKey; $private=$null }
    return
}
if (!(Test-Path -LiteralPath $packagePointer)) {
    throw 'Ambiente antigo sem pacote pareado. Preserve-o e execute -Mode Prepare -NewEnvironment.'
}
$package=Assert-LocalBuildPackage $projectRoot ([IO.File]::ReadAllText($packagePointer).Trim())
$fixture=Join-Path $package 'fixture/HomologationFixture.dll'
$api=Join-Path $package 'api/BurgerHouse.Api.dll'
if ($ApiBuildDirectory) {
    if (!$LocalCheckout) { throw 'O pacote alternativo so pode ser usado no Start -LocalCheckout.' }
    $candidate=(Resolve-Path -LiteralPath $ApiBuildDirectory).Path
    if ($candidate -ne (Join-Path $package 'api')) { throw 'Use a API pertencente ao pacote pareado deste ambiente.' }
}
if ($Mode -eq 'Start') { Assert-LocalPortAvailable 5449 }
$environmentNames=@('Privacy__EncryptionKey','Database__Provider','PagBank__Token','ASPNETCORE_ENVIRONMENT','DOTNET_ENVIRONMENT','ASPNETCORE_URLS','Homologation__Root','ConnectionStrings__DefaultConnection','PagBank__BaseUrl','PagBank__AllowUnsignedSandboxWebhooks','PagBank__RedirectUrl','PagBank__NotificationUrl','Cors__AllowedOrigins__0','Cors__AllowedOrigins__1','Admin__DataProtectionPath','Logging__LogLevel__Default','AZURE_TRANSLATION_ENABLED','HOMOLOGATION_ROOT','HOMOLOGATION_API_PORT','HOMOLOGATION_GATEWAY_PORT','HOMOLOGATION_EXPECTED_DATABASE','HOMOLOGATION_DISABLE_CHECKOUT','HOMOLOGATION_PUBLIC_READY','BURGER_BUILD_OUTPUT_DIR')
$savedEnvironment=@{}
foreach ($name in $environmentNames) { $savedEnvironment[$name]=[Environment]::GetEnvironmentVariable($name) }
try {
    $env:Privacy__EncryptionKey=Read-Private $private.privacy
    & dotnet $fixture --verify $root
    if ($LASTEXITCODE -ne 0) {throw 'Falha de integridade ou migrations no banco isolado. A API nao foi iniciada.'}
    if ($Mode -eq 'Verify') { return }
    if ($Mode -eq 'Web') {
        $web=if ($WebBuildDirectory) { (Resolve-Path -LiteralPath $WebBuildDirectory).Path } else { Join-Path $projectRoot '.test-tmp/portfolio-dev/web' }
        $resolvedWeb=[IO.Path]::GetFullPath($web)
        if ((!$resolvedWeb.StartsWith((Join-Path $projectRoot 'test-results')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and
            $resolvedWeb -ne (Join-Path $projectRoot '.test-tmp/portfolio-dev/web')) -or
            !(Test-Path (Join-Path $resolvedWeb 'static/index.html')) -or !(Test-Path (Join-Path $resolvedWeb 'static/admin/index.html'))) {
            throw 'Informe um pacote web local completo em test-results ou use o pacote do portfolio.'
        }
        $env:HOMOLOGATION_ROOT=$root
        $env:HOMOLOGATION_API_PORT='5449'
        $env:HOMOLOGATION_GATEWAY_PORT='4174'
        $env:HOMOLOGATION_EXPECTED_DATABASE='burgerhouse.homologation.db'
        $env:HOMOLOGATION_DISABLE_CHECKOUT='0'
        $env:HOMOLOGATION_PUBLIC_READY='0'
        $env:BURGER_BUILD_OUTPUT_DIR=$resolvedWeb
        Set-Location -LiteralPath $projectRoot
        & node scripts/serve-homologation.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Gateway isolado terminou com erro.' }
        return
    }
    if (!(Test-Path -LiteralPath $api -PathType Leaf)) {throw 'Compile a API de homologacao antes de iniciar.'}
    if ($PublicOrigin) {
        $uri=[Uri]$PublicOrigin
        if ($uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.Host -match 'azurewebsites\.net$' -or $uri.Host -eq 'burger-shop-aiib.vercel.app') {throw 'Origem HTTPS de homologacao invalida.'}
        $PublicOrigin=$uri.GetLeftPart([UriPartial]::Authority)
    } else {$PublicOrigin=if ($LocalCheckout) {'https://localhost:4174'} else {'https://acceptance.invalid'}}
    if (!$LocalCheckout) {
        if (!$WebhookOrigin) {$WebhookOrigin=$PublicOrigin}
        $webhookUri=[Uri]$WebhookOrigin
        if ($webhookUri.Scheme -ne 'https' -or $webhookUri.AbsolutePath -ne '/' -or $webhookUri.UserInfo -or $webhookUri.Query -or $webhookUri.Fragment -or $webhookUri.Host -match 'azurewebsites\.net$') {throw 'Origem de webhook isolado invalida.'}
        $WebhookOrigin=$webhookUri.GetLeftPart([UriPartial]::Authority)
    }
    $secretsPath=Join-Path $env:APPDATA 'Microsoft/UserSecrets/d52cfced-a3b4-4640-81e4-db29f9f29197/secrets.json'
    $existing=Get-Content -Raw $secretsPath|ConvertFrom-Json
    $configuredOrigin=if ($existing.'PagBank:BaseUrl') { $existing.'PagBank:BaseUrl' } else {
        (Get-Content (Join-Path $package 'api/appsettings.json') -Raw|ConvertFrom-Json).PagBank.BaseUrl
    }
    if (([string]$configuredOrigin).TrimEnd('/') -ne 'https://sandbox.api.pagseguro.com') {
        throw 'A configuracao privada nao seleciona o sandbox PagBank. Nenhuma credencial sera enviada.'
    }
    $env:PagBank__Token=if ($existing.'PagBank:SandboxToken') { $existing.'PagBank:SandboxToken' } else { $existing.'PagBank:Token' }
    if ([string]::IsNullOrWhiteSpace($env:PagBank__Token)) {throw 'Token sandbox existente indisponivel.'}
    if ($LocalCheckout) {
        # Authenticate a read-only request for a fresh nonexistent checkout. No payment is created.
        try {
            $probe=Invoke-WebRequest -Uri ('https://sandbox.api.pagseguro.com/checkouts/CHEC_'+[Guid]::NewGuid().ToString()) `
                -Headers @{Authorization=('Bearer '+$env:PagBank__Token)} -SkipHttpErrorCheck -MaximumRedirection 0 -TimeoutSec 15
            if ([int]$probe.StatusCode -ne 404) { throw 'Sandbox credential preflight failed.' }
        } catch { throw 'Sandbox PagBank indisponivel ou credencial nao validada. A API de checkout nao foi iniciada.' }
        finally { $probe=$null }
    }
    # Never inherit PostgreSQL selection or connection settings from the portfolio shell.
    $env:Database__Provider='SQLite'
    $env:AZURE_TRANSLATION_ENABLED='false'
    $env:ASPNETCORE_ENVIRONMENT='Homologation'
    $env:DOTNET_ENVIRONMENT='Homologation'
    $env:ASPNETCORE_URLS='http://127.0.0.1:5449'
    $env:Homologation__Root=$root
    $env:ConnectionStrings__DefaultConnection='Data Source='+ (Join-Path $root 'burgerhouse.homologation.db')+';Mode=ReadWrite'
    $env:PagBank__BaseUrl='https://sandbox.api.pagseguro.com'
    $env:PagBank__AllowUnsignedSandboxWebhooks='false'
    $env:PagBank__RedirectUrl=$PublicOrigin+'/menu'
    # Whitespace overrides any appsettings default on PowerShell versions that unset empty variables.
    $env:PagBank__NotificationUrl=if ($LocalCheckout) {' '} else {$WebhookOrigin+'/api/webhooks/pagbank'}
    $env:Cors__AllowedOrigins__0='https://localhost:4174'
    $env:Cors__AllowedOrigins__1=$PublicOrigin
    $env:Admin__DataProtectionPath=Join-Path $root 'data-protection'
    $env:Logging__LogLevel__Default='Warning'
    Write-Host 'API de homologacao: http://127.0.0.1:5449 — banco isolado; sandbox obrigatorio.'
    Assert-LocalPortAvailable 5449
    & dotnet $api --contentRoot (Split-Path $api)
    if ($LASTEXITCODE -ne 0) { throw 'A API isolada terminou com erro.' }
} finally {
    foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name]) }
    $private=$null;$existing=$null
}
