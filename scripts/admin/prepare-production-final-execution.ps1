[CmdletBinding()]
param([switch]$CopyToClipboard,[string]$ApprovalReference)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$specs=@(
    @{file='scripts/admin/production-catalog-cleanup.py';sha='4496a9aa99d0879081c8be21af0b0fb70b7419aed2ed4a32ace4de4958c25c47'},
    @{file='scripts/admin/production-final-preflight.py';sha='ba2bb2600c3171186b689710a4f31aea0116b9fba73ffcbbb3bfde63113a5a6a'},
    @{file='scripts/admin/production-catalog-final-gate.py';sha='e5d4a5fb67e2d25e69e817cbddb03ce32ed0419dfd4bd68ca464a9b758be7d5c'}
)
foreach($spec in $specs){
    if((Get-FileHash -LiteralPath (Join-Path $projectRoot $spec.file) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $spec.sha){throw ('Arquivo divergente: '+$spec.file)}
}
if(!$CopyToClipboard){[pscustomobject]@{status='local-hashes-verified';productionModified=$false;executionPrepared=$false;awaitingSpecificOwnerAuthorization=$true};return}
if($ApprovalReference -cne 'OWNER-FINAL-CATALOG-CLEANUP-2026-10-28'){throw 'Referencia especifica da autorizacao final ausente.'}
# Use only AFTER the Owner explicitly authorizes the real production deletion.
# Clipboard preparation itself makes no network request and opens no database.
$encoded=[Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $projectRoot $specs[2].file)))
$bootstrap=@"
import base64,hashlib,os,pathlib,runpy,sys
root=pathlib.Path('/home/backups/catalog-cleanup')
if not root.is_dir() or root.is_symlink(): raise RuntimeError('Reviewed directory identity mismatch.')
sha='e5d4a5fb67e2d25e69e817cbddb03ce32ed0419dfd4bd68ca464a9b758be7d5c'
data=base64.b64decode('$encoded',validate=True)
if hashlib.sha256(data).hexdigest()!=sha: raise RuntimeError('Final gate transfer hash mismatch.')
destination=root/'production-catalog-final-gate-e5d4a5fb67e2d25e.py'
if destination.is_symlink(): raise RuntimeError('Refusing symbolic link.')
if destination.exists():
    if hashlib.sha256(destination.read_bytes()).hexdigest()!=sha: raise RuntimeError('Existing source differs; refusing overwrite.')
else:
    fd=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    with os.fdopen(fd,'wb') as output: output.write(data)
if hashlib.sha256(destination.read_bytes()).hexdigest()!=sha: raise RuntimeError('Readback hash mismatch.')
sys.dont_write_bytecode=True
sys.argv=[str(destination),'--execute-approved','--approval-reference','$ApprovalReference']
runpy.run_path(str(destination),run_name='__main__')
"@
Set-Clipboard ("python3 - <<'BH_APPROVED_FINAL_CATALOG_CLEANUP'`n"+$bootstrap+"`nBH_APPROVED_FINAL_CATALOG_CLEANUP`n")
Write-Host 'Comando DESTRUTIVO preparado. Cole no SSH somente apos a autorizacao final especifica do Owner.'
