# Requires PowerShell 7. No remote operation occurs without -ConfirmTransfer.
[CmdletBinding()]
param([switch]$ConfirmTransfer)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$file = Join-Path $projectRoot 'test-results/azure-owner-recovery-private.sh'
$audit = Get-Content -Raw -LiteralPath (Join-Path $projectRoot 'test-results/azure-owner-recovery-audit.json') | ConvertFrom-Json
$bytes = [IO.File]::ReadAllBytes($file)
$digest = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
if ($digest -cne $audit.launcherSha256 -or $bytes.Length -ne $audit.launcherBytes) { throw 'Arquivo diferente da versao revisada. Transferencia bloqueada.' }
$name = 'bh-owner-recovery-' + $digest.Substring(0, 16) + '.sh'
$remote = '/home/' + $name
$plan = [ordered]@{ localFile = $file; bytes = $bytes.Length; sha256 = $digest; remotePath = $remote; transferred = $false; resetExecuted = $false }
if (!$ConfirmTransfer) { [pscustomobject]$plan; return }
if (!(Get-Command az -ErrorAction SilentlyContinue)) { throw 'Instale Azure CLI e autentique-se com az login --use-device-code no terminal privado.' }
# Never request publishing passwords, modify roles or change authentication settings.
$appsJson = & az webapp list --query "[?name=='the-burger-house-api'].{id:id,host:defaultHostName}" --output json --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Azure CLI nao conseguiu consultar a assinatura autenticada.' }
$apps = @($appsJson | ConvertFrom-Json)
if ($apps.Count -ne 1 -or $apps[0].host -cne 'the-burger-house-api-gqfkakgnfvfxd0g0.brazilsouth-01.azurewebsites.net') { throw 'O App Service da assinatura atual nao corresponde a producao esperada.' }
$hostsJson = & az webapp show --ids $apps[0].id --query enabledHostNames --output json --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Falha ao consultar o endereco oficial SCM.' }
$scm = @($hostsJson | ConvertFrom-Json | Where-Object { $_ -match '^the-burger-house-api[^/]*\.scm\.[^/]*azurewebsites\.net$' })
if ($scm.Count -ne 1) { throw 'Endereco SCM nao identificado com seguranca.' }
$token = $null
$handler = [Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(60)
try {
    $token = & az account get-access-token --resource https://management.azure.com/ --query accessToken --output tsv --only-show-errors
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) { throw 'Token Azure indisponivel. Nenhuma alteracao de autenticacao sera feita.' }
    $client.DefaultRequestHeaders.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token.Trim())
    $base = 'https://' + $scm[0]
    $vfsRoot = $null
    foreach ($candidate in @('/api/vfs/', '/api/vfs/home/')) {
        $listing = $client.GetAsync($base + $candidate).GetAwaiter().GetResult()
        try {
            if ([int]$listing.StatusCode -in @(401, 403)) { throw "SCM HTTP $([int]$listing.StatusCode). Pare e confira o acesso Azure existente; nao habilite autenticacao basica." }
            if (!$listing.IsSuccessStatusCode) { continue }
            $items = $listing.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
            if (@($items | Where-Object { $_.name -ceq 'burgerhouse.db' }).Count -eq 1) { $vfsRoot = $candidate; break }
        } finally { $listing.Dispose() }
    }
    if (!$vfsRoot) { throw 'Diretorio /home nao confirmado. Nenhum arquivo enviado.' }
    $uri = $base + $vfsRoot + $name
    $existing = $client.GetAsync($uri).GetAwaiter().GetResult()
    try {
        if ([int]$existing.StatusCode -eq 404) { $create = $true }
        elseif ($existing.IsSuccessStatusCode) {
            $present = $existing.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
            if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($present)).ToLowerInvariant() -cne $digest) { throw 'Destino existente diferente. Sobrescrita recusada.' }
            $create = $false
        } else { throw "Leitura do destino: HTTP $([int]$existing.StatusCode). Nenhum envio." }
    } finally { $existing.Dispose() }
    if ($create) {
        $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Put, $uri)
        $request.Headers.IfNoneMatch.Add([Net.Http.Headers.EntityTagHeaderValue]::Any)
        $request.Content = [Net.Http.ByteArrayContent]::new($bytes)
        $request.Content.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')
        try {
            $response = $client.SendAsync($request).GetAwaiter().GetResult()
            try { if (!$response.IsSuccessStatusCode) { throw "Transferencia: HTTP $([int]$response.StatusCode). Nao executar o arquivo." } }
            finally { $response.Dispose() }
        } finally { $request.Dispose() }
    }
    $readback = $client.GetAsync($uri).GetAwaiter().GetResult()
    try {
        if (!$readback.IsSuccessStatusCode) { throw "Conferencia: HTTP $([int]$readback.StatusCode). Nao executar o arquivo." }
        $received = $readback.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        if ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($received)).ToLowerInvariant() -cne $digest) { throw 'Hash remoto divergente. Nao executar o arquivo.' }
    } finally { $readback.Dispose() }
    $plan.transferred = $true
    [pscustomobject]$plan | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectRoot 'test-results/owner-recovery-transfer.json') -Encoding utf8
    [pscustomobject]$plan
} finally {
    $client.DefaultRequestHeaders.Authorization = $null
    $token = $null
    $client.Dispose()
    $handler.Dispose()
}
