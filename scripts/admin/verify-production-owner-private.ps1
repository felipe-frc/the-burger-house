$ErrorActionPreference='Stop'
Set-Location -LiteralPath ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')))
$secret=$null
$pointer=[IntPtr]::Zero
try {
    Write-Host 'THE BURGER HOUSE - conferencia final de producao'
    Write-Host 'Somente consultas e login/logout. Nao cria pedidos nem altera pagamentos/produtos.'
    $env:BURGER_ADMIN_EMAIL=Read-Host 'E-mail Owner existente'
    $secret=Read-Host 'Senha Owner existente (oculta)' -AsSecureString
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:BURGER_ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    & node scripts/admin/verify-production-owner-closeout.mjs
} finally {
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    if($null -ne $secret){$secret.Dispose()}
    Remove-Item Env:BURGER_ADMIN_EMAIL,Env:BURGER_ADMIN_PASSWORD -ErrorAction SilentlyContinue
}
Write-Host 'Conferencia encerrada. O relatorio nao contem credenciais.'
Read-Host 'Pressione Enter para fechar'
