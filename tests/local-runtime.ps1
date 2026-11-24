param([Parameter(Mandatory)][string] $PackageDirectory)
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $repo 'scripts/admin/local-runtime.ps1')
$passed=0
$package=Assert-LocalBuildPackage $repo $PackageDirectory
$passed++
$description=(& dotnet (Join-Path $package 'fixture/HomologationFixture.dll') --describe)|ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or $description.sqlite.Count -ne 28 -or $description.postgresql.Count -ne 4) { throw 'Provider migration sets differ.' }
$passed++
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start()
$port=$listener.LocalEndpoint.Port
try {
    $rejected=$false
    try { Assert-LocalPortAvailable $port } catch { $rejected=$_.Exception.Message -match 'ocupada' }
    if (!$rejected) { throw 'Occupied port was accepted.' }
    $passed++
} finally { $listener.Stop() }
Assert-LocalPortAvailable $port
$passed++
$fake=Join-Path $repo ('test-results/local-runtime/stale-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fake)
'{"version":1,"sourceSha256":"outdated"}' | Set-Content (Join-Path $fake 'package.json')
$rejected=$false
try { Assert-LocalBuildPackage $repo $fake } catch { $rejected=$_.Exception.Message -match 'desatualizado' }
if (!$rejected) { throw 'Stale build was accepted.' }
$passed++
[pscustomobject]@{ passed=$passed; failed=0; sqliteMigrations=$description.sqlite.Count; postgresMigrations=$description.postgresql.Count } | ConvertTo-Json
