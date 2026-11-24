# Shared local launch checks. Builds never overwrite DLLs loaded by a running host.
function Assert-LocalPortAvailable([int] $Port) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start() }
    catch {
        $owner = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty OwningProcess
        throw "Porta local $Port ocupada (PID $owner). Encerre somente a instancia identificada antes de iniciar outra."
    }
    finally { $listener.Stop() }
}

function Get-LocalSourceHash([string] $Repository) {
    $files = Get-ChildItem (Join-Path $Repository 'backend') -Recurse -File |
        Where-Object { $_.Extension -in '.cs','.csproj','.props','.targets','.json' -and
            $_.FullName -notmatch '[\\/](bin|obj|artifacts|TestSupport)[\\/]|\.Tests[\\/]' -and
            $_.Name -notmatch '^appsettings\.' }
    $rows = foreach ($file in ($files | Sort-Object FullName)) {
        $relative = [IO.Path]::GetRelativePath($Repository, $file.FullName).Replace('\','/')
        $relative + ':' + (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($rows -join "`n"))
    [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))
}

function New-LocalBuildPackage([string] $Repository) {
    $sourceHash = Get-LocalSourceHash $Repository
    $directory = Join-Path $Repository ('test-results/local-runtime/build-' + [Guid]::NewGuid().ToString('N'))
    [void][IO.Directory]::CreateDirectory($directory)
    $mutex = [Threading.Mutex]::new($false, 'Local\BurgerHouseBuild-' + $sourceHash.Substring(0,16))
    $held = $false
    try {
        $held = $mutex.WaitOne(0)
        if (!$held) { throw 'Outro build local do mesmo codigo esta em andamento. Aguarde sua conclusao.' }
        foreach ($entry in @(
            @{ Project='backend/BurgerHouse.Api'; Output='api' },
            @{ Project='backend/tools/HomologationFixture'; Output='fixture' }
        )) {
            $log = Join-Path $directory ($entry.Output + '-build.log')
            & dotnet publish (Join-Path $Repository $entry.Project) --configuration Release `
                --artifacts-path (Join-Path $directory 'artifacts') --output (Join-Path $directory $entry.Output) *> $log
            if ($LASTEXITCODE -ne 0) { throw "Falha no build local. Consulte $log (nenhuma API ativa foi sobrescrita)." }
        }
        if ((Get-LocalSourceHash $Repository) -ne $sourceHash) { throw 'Codigo mudou durante o build. Gere outro pacote.' }
        $apiHash = (Get-FileHash (Join-Path $directory 'api/BurgerHouse.Infrastructure.dll')).Hash
        $fixtureHash = (Get-FileHash (Join-Path $directory 'fixture/BurgerHouse.Infrastructure.dll')).Hash
        if ($apiHash -ne $fixtureHash) { throw 'API e fixture foram compiladas com Infrastructure diferentes.' }
        $manifest = [ordered]@{ version=1; sourceSha256=$sourceHash; infrastructureSha256=$apiHash;
            apiSha256=(Get-FileHash (Join-Path $directory 'api/BurgerHouse.Api.dll')).Hash;
            fixtureSha256=(Get-FileHash (Join-Path $directory 'fixture/HomologationFixture.dll')).Hash }
        $manifest | ConvertTo-Json | Set-Content (Join-Path $directory 'package.json')
        return $directory
    }
    finally { if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
}

function Assert-LocalBuildPackage([string] $Repository, [string] $Directory) {
    $resolved = (Resolve-Path -LiteralPath $Directory).Path
    $allowed = [IO.Path]::GetFullPath((Join-Path $Repository 'test-results')) + [IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Pacote local deve estar em test-results.' }
    $manifest = Get-Content -LiteralPath (Join-Path $resolved 'package.json') -Raw | ConvertFrom-Json
    if ($manifest.version -ne 1 -or $manifest.sourceSha256 -ne (Get-LocalSourceHash $Repository)) {
        throw 'Pacote desatualizado. Use -Mode Refresh para validar o codigo atual sem recriar o banco; se o esquema for incompativel, prepare outro ambiente.'
    }
    foreach ($pair in @(
        @('api/BurgerHouse.Infrastructure.dll', $manifest.infrastructureSha256),
        @('fixture/BurgerHouse.Infrastructure.dll', $manifest.infrastructureSha256),
        @('api/BurgerHouse.Api.dll', $manifest.apiSha256),
        @('fixture/HomologationFixture.dll', $manifest.fixtureSha256)
    )) {
        if ((Get-FileHash -LiteralPath (Join-Path $resolved $pair[0])).Hash -ne $pair[1]) {
            throw 'Assembly diferente do pacote revisado. Gere outro pacote local.'
        }
    }
    foreach ($configuration in Get-ChildItem (Join-Path $Repository 'backend/BurgerHouse.Api/appsettings*.json') -File) {
        $packaged = Join-Path $resolved ('api/' + $configuration.Name)
        if (!(Test-Path -LiteralPath $packaged) -or
            (Get-FileHash -LiteralPath $configuration.FullName).Hash -ne (Get-FileHash -LiteralPath $packaged).Hash) {
            throw 'Configuracao do pacote desatualizada. Gere outro pacote local.'
        }
    }
    return $resolved
}
