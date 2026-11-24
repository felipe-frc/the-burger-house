param(
    [Parameter(Mandatory)] [string]$Python,
    [Parameter(Mandatory)] [string]$Psql
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if ($env:PGHOST -ne '127.0.0.1' -or $env:PGDATABASE -ne 'tbh_migration_lab' -or $env:PGHOSTADDR -or $env:PGSERVICE) {
    throw 'This test requires the dedicated loopback tbh_migration_lab database.'
}
$originalConnection = $env:ConnectionStrings__DefaultConnection
$settings = [System.Data.Common.DbConnectionStringBuilder]::new()
$settings['Host'] = '127.0.0.1'
$settings['Port'] = [string][int]$env:PGPORT
$settings['Database'] = 'tbh_migration_lab'
$settings['Username'] = $env:PGUSER
$settings['Password'] = $env:PGPASSWORD
$pgConnection = $settings.ConnectionString
$Python = (Resolve-Path $Python).Path
$Psql = (Resolve-Path $Psql).Path
$evidence = Join-Path $repo ('test-results/postgres-validation/import-' + [guid]::NewGuid())
$fixture = Join-Path $repo ('.test-tmp/burgerhouse-homologation-owner-test-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $evidence | Out-Null
$env:Privacy__EncryptionKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:HOMOLOGATION_OWNER_PASSWORD = 'Local-' + [guid]::NewGuid()
$ef = @('tool','run','dotnet-ef','database','update')
$projects = @('--configuration','Release','--project','BurgerHouse.Infrastructure','--startup-project','BurgerHouse.Api')
Push-Location (Join-Path $repo 'backend')
try {
    foreach ($version in 24,27,28) {
        if ($version -eq 24) {
            $source = Join-Path $repo ('.test-tmp/pg-legacy-' + [guid]::NewGuid() + '.db')
            $env:ConnectionStrings__DefaultConnection = "Data Source=$source"
            & dotnet @ef '20261116095617_AddOwnerOperationalModules' --context BurgerHouseDbContext @projects
        } else {
            $versionFixture = "$fixture-$version"
            & dotnet run --project tools/HomologationFixture -- --owner-dashboard $versionFixture
            $source = Join-Path $versionFixture 'burgerhouse.homologation.db'
            if ($version -eq 27) {
                $env:ConnectionStrings__DefaultConnection = "Data Source=$source"
                & dotnet @ef '20261118132251_AddOrderItemSaleCategory' --context BurgerHouseDbContext @projects
            }
        }
        if ($LASTEXITCODE) { throw 'Synthetic SQLite preparation failed.' }
        $schema = 'import_' + [guid]::NewGuid().ToString('N')
        & $Psql -X -v ON_ERROR_STOP=1 -c "create schema $schema"
        if ($LASTEXITCODE) { throw 'Isolated schema creation failed.' }
        $env:ConnectionStrings__DefaultConnection = "$pgConnection;Search Path=$schema"
        $env:PGOPTIONS = "-c search_path=$schema"
        & dotnet @ef --context PostgresContext @projects
        if ($LASTEXITCODE) { throw 'PostgreSQL migration failed.' }
        $argsImport = @((Join-Path $repo 'scripts/admin/import-sqlite-postgres.py'), $source, '--database', 'tbh_migration_lab', '--schema', $schema)
        if ($version -eq 27) {
            & $Python @argsImport 2> (Join-Path $evidence 'rollback.log')
            if ($LASTEXITCODE -ne 1 -or !(Select-String -Quiet -Path (Join-Path $evidence 'rollback.log') -Pattern 'timestamp')) { throw 'Expected explicit date policy refusal.' }
        }
        & $Python @argsImport --sqlite-utc --truncate-ticks > (Join-Path $evidence "transfer$version.json")
        if ($LASTEXITCODE) { throw 'Full transfer failed.' }
        & $Python @argsImport --sqlite-utc --truncate-ticks 2> (Join-Path $evidence "retry$version.log")
        if ($LASTEXITCODE -ne 1 -or !(Select-String -Quiet -Path (Join-Path $evidence "retry$version.log") -Pattern 'Target contains records')) { throw 'Expected nonempty target refusal.' }
        & $Psql -X -v ON_ERROR_STOP=1 -Atc 'SELECT count(*) FROM "Products"'
        if ($LASTEXITCODE) { throw 'New connection could not read imported catalog.' }
    }
    Write-Output "Import tests passed. Evidence in $evidence"
} finally {
    Pop-Location
    $env:ConnectionStrings__DefaultConnection = $originalConnection
}
