[CmdletBinding()]
param([switch]$CopyToClipboard)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$specs=@(
    @{file='test-results/catalog-final/production-copy-only-rehearsal.py';sha='a27c60d84a993a0b0cc8e7d52bf1398bf43d24247ff0d84c1d0ca80f1d1f4c4b';transfer=$false},
    @{file='scripts/admin/production-catalog-cleanup.py';sha='4496a9aa99d0879081c8be21af0b0fb70b7419aed2ed4a32ace4de4958c25c47';transfer=$true;remote='production-catalog-executor-4496a9aa99d08790.py'},
    @{file='scripts/admin/production-final-preflight.py';sha='ba2bb2600c3171186b689710a4f31aea0116b9fba73ffcbbb3bfde63113a5a6a';transfer=$true;remote='production-final-preflight-ba2bb2600c317118.py'}
)
$payloads=@()
foreach($spec in $specs){
    $path=Join-Path $projectRoot $spec.file
    $bytes=[IO.File]::ReadAllBytes($path)
    $hasher=[Security.Cryptography.SHA256]::Create()
    try{$actual=[BitConverter]::ToString($hasher.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$hasher.Dispose()}
    if($actual -cne $spec.sha){throw ('Arquivo divergente: '+$spec.file+'. Nenhum comando remoto preparado.')}
    if($spec.transfer){$payloads+=@{name=$spec.remote;sha256=$spec.sha;data=[Convert]::ToBase64String($bytes)}}
}
if(!$CopyToClipboard){[pscustomobject]@{status='local-hashes-verified';copyRunner=$specs[0].sha;executor=$specs[1].sha;readOnlyChecker=$specs[2].sha;remoteExecutionPrepared=$false};return}
# Gzip/Base64 transport contains only these two reviewed UTF-8 source files.
# It preserves exact bytes across Windows/SSH; no credentials or binaries.
$json=$payloads|ConvertTo-Json -Depth 5 -Compress
$stream=[IO.MemoryStream]::new()
$zip=[IO.Compression.GZipStream]::new($stream,[IO.Compression.CompressionLevel]::Optimal,$true)
try{$bytes=[Text.Encoding]::UTF8.GetBytes($json);$zip.Write($bytes,0,$bytes.Length)}finally{$zip.Dispose()}
$encoded=[Convert]::ToBase64String($stream.ToArray());$stream.Dispose()
$bootstrap=@"
import base64,gzip,hashlib,json,os,pathlib,runpy,sys
root=pathlib.Path('/home/backups/catalog-cleanup')
if not root.is_dir(): raise RuntimeError('Reviewed backup directory missing.')
items=json.loads(gzip.decompress(base64.b64decode('$encoded')))
expected={'production-catalog-executor-4496a9aa99d08790.py':'4496a9aa99d0879081c8be21af0b0fb70b7419aed2ed4a32ace4de4958c25c47','production-final-preflight-ba2bb2600c317118.py':'ba2bb2600c3171186b689710a4f31aea0116b9fba73ffcbbb3bfde63113a5a6a'}
if len(items)!=2 or {i['name'] for i in items}!=set(expected): raise RuntimeError('Unexpected transfer manifest.')
for item in items:
    data=base64.b64decode(item['data']);destination=root/item['name']
    if hashlib.sha256(data).hexdigest()!=expected[item['name']] or item['sha256']!=expected[item['name']]: raise RuntimeError('Transferred source hash mismatch.')
    if destination.is_symlink(): raise RuntimeError('Refusing symbolic link.')
    if destination.exists():
        if hashlib.sha256(destination.read_bytes()).hexdigest()!=expected[item['name']]: raise RuntimeError('Existing source differs; refusing overwrite.')
    else:
        descriptor=os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(descriptor,'wb') as output: output.write(data)
    if hashlib.sha256(destination.read_bytes()).hexdigest()!=expected[item['name']]: raise RuntimeError('Readback source hash mismatch.')
checker=root/'production-final-preflight-ba2bb2600c317118.py'
sys.argv=[str(checker)]
sys.dont_write_bytecode=True
runpy.run_path(str(checker),run_name='__main__')
"@
Set-Clipboard ("python3 - <<'BH_FINAL_READONLY_PREFLIGHT'`n"+$bootstrap+"`nBH_FINAL_READONLY_PREFLIGHT`n")
Write-Host 'Clipboard preparada: transfere fontes revisadas e executa somente a conferencia READ-ONLY-FINAL-PREFLIGHT.'
Write-Host 'Nao executa o ensaio novamente, --execute-approved, --rollback-approved ou exclusoes.'
