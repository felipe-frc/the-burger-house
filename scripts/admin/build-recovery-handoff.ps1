$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$output = Join-Path $projectRoot 'test-results/azure-owner-recovery-private.sh'
$artifactRoot = Join-Path $projectRoot 'backend/artifacts/recovery-tools/bin'
$builder = [System.Text.StringBuilder]::new()
[void]$builder.AppendLine('#!/usr/bin/env bash')
[void]$builder.AppendLine('set -euo pipefail')
[void]$builder.AppendLine('umask 077')
[void]$builder.AppendLine('case "${1:---inspect-only}" in')
[void]$builder.AppendLine('  --inspect-only) mode="inspect" ;;')
[void]$builder.AppendLine('  --reset-owner-password) mode="reset" ;;')
[void]$builder.AppendLine('  *) printf ''Use --inspect-only or --reset-owner-password\n'' >&2; exit 64 ;;')
[void]$builder.AppendLine('esac')
[void]$builder.AppendLine('app="/home/site/wwwroot"')
[void]$builder.AppendLine('database="/home/burgerhouse.db"')
[void]$builder.AppendLine('backup="/home/backups/burgerhouse-before-owner-reset-20261027-200847.db"')
[void]$builder.AppendLine('test -f "$database" && test -f "$backup" && test -f "$app/BurgerHouse.Api.dll"')
[void]$builder.AppendLine('work="$(mktemp -d /home/bh-owner-recovery.XXXXXX)"')
foreach ($tool in @('RecoveryInspector', 'OwnerRecoveryHost')) {
    foreach ($extension in @('dll', 'runtimeconfig.json')) {
        $file = Join-Path $artifactRoot "$tool/debug/$tool.$extension"
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $hash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        $encoded = [Convert]::ToBase64String($bytes)
        $delimiter = 'BH_' + $tool + '_' + ($extension -replace '\.', '_')
        [void]$builder.AppendLine(('base64 --decode > "$work/{0}.{1}" <<''{2}''' -f $tool, $extension, $delimiter))
        for ($position = 0; $position -lt $encoded.Length; $position += 100) {
            [void]$builder.AppendLine($encoded.Substring($position, [Math]::Min(100, $encoded.Length - $position)))
        }
        [void]$builder.AppendLine($delimiter)
        [void]$builder.AppendLine(('printf ''{0}  %s\n'' "$work/{1}.{2}" | sha256sum -c -' -f $hash, $tool, $extension))
    }
}
[void]$builder.AppendLine('dotnet "$work/RecoveryInspector.dll" "$app/BurgerHouse.Api.dll" "$app/BurgerHouse.Infrastructure.dll" | tee "$work/published-inspection.json"')
[void]$builder.AppendLine('dotnet "$work/OwnerRecoveryHost.dll" "$app" "$database" "$backup" --inspect-only | tee "$work/preflight.json"')
[void]$builder.AppendLine('if [ "$mode" = "inspect" ]; then printf ''VERIFICACAO_CONCLUIDA: reset nao executado.\n''; exit 0; fi')
[void]$builder.AppendLine('printf ''\nPreflight aprovado. Digite a NOVA senha somente neste terminal privado, duas vezes, quando solicitado.\n''')
[void]$builder.AppendLine('dotnet "$work/OwnerRecoveryHost.dll" "$app" "$database" "$backup" --reset-owner-password < /dev/tty')
[void]$builder.AppendLine('printf ''\nConcluido. Compartilhe apenas as linhas JSON de resultado, nunca a senha. Ferramentas temporarias em: %s\n'' "$work"')
[System.IO.Directory]::CreateDirectory((Split-Path -Parent $output)) | Out-Null
[System.IO.File]::WriteAllText($output, $builder.ToString().Replace("`r`n", "`n"), [System.Text.UTF8Encoding]::new($false))
Write-Output "Comando SSH privado preparado em: $output"
Write-Output 'Nao contem credenciais. Nao substitui arquivos publicados. Nao executa migrations ou reinicio.'
