param([ValidateSet('Prepare','Verify','Trust')][string]$Mode = 'Verify', [string]$ExpectedRootThumbprint)
$ErrorActionPreference = 'Stop'
if (!$IsWindows) { throw 'Este procedimento usa DPAPI e o certificado raiz do usuario Windows.' }
$directory = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path '.test-tmp/portfolio-dev/tls'
$rootPath = Join-Path $directory 'root.crt'
$rootKeyPath = Join-Path $directory 'root.key.dpapi'
$certPath = Join-Path $directory 'localhost.crt'
$keyPath = Join-Path $directory 'localhost.key'
function PublicCertificate([string]$Path) {
    [Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($Path))
}
if ($Mode -eq 'Prepare') {
    [void][IO.Directory]::CreateDirectory($directory)
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls.exe $directory /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' *> $null
    if ($LASTEXITCODE) { throw 'Nao foi possivel restringir o diretorio de chaves locais.' }
    $rsa = [Security.Cryptography.RSA]::Create(3072)
    try {
        if (!(Test-Path $rootPath) -and !(Test-Path $rootKeyPath)) {
            $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=The Burger House Local Development CA', $rsa, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
            $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
            $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]'KeyCertSign, CrlSign',$true))
            $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509SubjectKeyIdentifierExtension]::new($request.PublicKey,$false))
            $root = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddYears(3))
            [IO.File]::WriteAllText($rootPath, $root.ExportCertificatePem())
            $privateText = [Convert]::ToBase64String($rsa.ExportPkcs8PrivateKey())
            ConvertTo-SecureString $privateText -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $rootKeyPath
            $privateText = $null
        } elseif ((Test-Path $rootPath) -and (Test-Path $rootKeyPath)) {
            $secret = ConvertTo-SecureString ([IO.File]::ReadAllText($rootKeyPath).Trim())
            $bytes = [Convert]::FromBase64String([Net.NetworkCredential]::new('',$secret).Password)
            $read = 0; $rsa.ImportPkcs8PrivateKey($bytes,[ref]$read); [Array]::Clear($bytes)
            $public = PublicCertificate $rootPath
            $root = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($public,$rsa)
        } else { throw 'Par raiz/chave incompleto. Nao sera substituido automaticamente.' }
        if ($root.NotAfter -lt (Get-Date).AddDays(100)) { throw 'CA perto do vencimento. Renovacao e nova confianca exigem revisao explicita.' }
        $renew = !(Test-Path $certPath) -or !(Test-Path $keyPath)
        if (!$renew) { $current = PublicCertificate $certPath; $renew = $current.NotAfter -lt (Get-Date).AddDays(14); $current.Dispose() }
        if ($renew) {
            $leafKey = [Security.Cryptography.RSA]::Create(2048)
            try {
                $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $leafKey, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
                $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
                $san.AddDnsName('localhost'); $san.AddIpAddress([Net.IPAddress]::Parse('127.0.0.1')); $san.AddIpAddress([Net.IPAddress]::IPv6Loopback)
                $request.CertificateExtensions.Add($san.Build())
                $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
                $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]'DigitalSignature, KeyEncipherment',$true))
                $usage = [Security.Cryptography.OidCollection]::new(); [void]$usage.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
                $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($usage,$true))
                $serial = [Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
                $leaf = $request.Create($root,[DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(90),$serial)
                [IO.File]::WriteAllText($certPath, $leaf.ExportCertificatePem() + "`n" + $root.ExportCertificatePem())
                [IO.File]::WriteAllText($keyPath, $leafKey.ExportPkcs8PrivateKeyPem())
                $leaf.Dispose()
            } finally { $leafKey.Dispose() }
        }
        $root.Dispose()
    } finally { $rsa.Dispose() }
}
$root = PublicCertificate $rootPath
$leaf = PublicCertificate $certPath
if ($Mode -eq 'Trust') {
    # Run only after the owner explicitly authorizes this public certificate's thumbprint.
    if (!$ExpectedRootThumbprint -or $root.Thumbprint -ne $ExpectedRootThumbprint) { throw 'Confirme explicitamente a impressao digital da CA aprovada.' }
    Import-Certificate -FilePath $rootPath -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
}
$chain = [Security.Cryptography.X509Certificates.X509Chain]::new()
# This private offline CA has no online revocation service. Browser TLS checks remain enabled.
$chain.ChainPolicy.RevocationMode = [Security.Cryptography.X509Certificates.X509RevocationMode]::NoCheck
$osTrusted = $chain.Build($leaf)
$status = $chain.ChainStatus.Status -join ','
$chain.ChainPolicy.TrustMode = [Security.Cryptography.X509Certificates.X509ChainTrustMode]::CustomRootTrust
[void]$chain.ChainPolicy.CustomTrustStore.Add($root)
$chainValid = $chain.Build($leaf)
if (!$chainValid) { throw 'Cadeia criptografica local invalida.' }
[pscustomobject]@{Certificate=$certPath; Root=$rootPath; RootThumbprint=$root.Thumbprint; Subject=$leaf.Subject;
    Issuer=$leaf.Issuer; NotBefore=$leaf.NotBefore; NotAfter=$leaf.NotAfter;
    SAN=($leaf.Extensions | Where-Object {$_.Oid.Value -eq '2.5.29.17'} | ForEach-Object {$_.Format($false)});
    SignatureChainValid=$chainValid; WindowsTrusted=$osTrusted; WindowsStatus=$status;
    TrustCommand="pwsh -NoProfile -File scripts/admin/local-https.ps1 -Mode Trust -ExpectedRootThumbprint $($root.Thumbprint)"} | ConvertTo-Json
$env:HOMOLOGATION_TLS_CERT = $certPath; $env:HOMOLOGATION_TLS_KEY = $keyPath
$chain.Dispose(); $leaf.Dispose(); $root.Dispose()
