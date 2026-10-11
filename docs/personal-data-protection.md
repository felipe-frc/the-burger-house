# Proteção de dados pessoais — Etapa 2A

`IPersonalDataProtector` pertence à Application. A implementação
`AesGcmPersonalDataProtector`, na Infrastructure, usa AES-256-GCM. O DI registra
um singleton com a configuração externa `Privacy:EncryptionKey`. A chave é
obrigatória, Base64 canônico de exatamente 32 bytes; configuração ausente ou
inválida impede a inicialização, sem fallback de escrita em plaintext.

## Configuração local

Gere uma chave uma única vez, em PowerShell, sem imprimir seu valor:

```powershell
$privacyBytes = New-Object byte[] 32
$privacyRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $privacyRng.GetBytes($privacyBytes)
    $env:Privacy__EncryptionKey = [Convert]::ToBase64String($privacyBytes)
} finally {
    [Array]::Clear($privacyBytes, 0, $privacyBytes.Length)
    $privacyRng.Dispose()
}
```

Antes de persistir dados, guarde essa mesma chave em armazenamento seguro fora
do repositório. Reutilize-a em todos os processos e reinícios que acessam o mesmo
banco. Não execute a geração a cada inicialização. A variável acima só existe
na sessão e nos processos filhos; perder a chave torna os dados cifrados
irrecuperáveis. Não coloque valores reais em appsettings, testes, migrations,
logs, comandos versionados ou documentação. Nenhuma configuração Azure é
alterada por esta etapa.

A factory de design do EF também lê `Privacy__EncryptionKey` e
`ConnectionStrings__DefaultConnection` do ambiente. Sem a segunda variável,
usa `Data Source=burgerhouse.db` relativo ao diretório de execução. Confira o
caminho antes de executar comandos que atualizem um banco. Gerar uma migration
não exige aplicar mudanças no banco da aplicação.

## Persistência e formato

Conversores EF Core protegem `Orders.CustomerTaxId`, `CustomerEmail`,
`CustomerPhone`, `ZipCode`, `Street`, `HouseNumber`, `Neighborhood`, `City`,
`Complement`, `Observation` e `OrderItems.Observation`. As entidades e DTOs
continuam recebendo plaintext em memória. `CustomerName` permanece plaintext
para preservar a pesquisa SQL do Admin; dados financeiros, catálogo, IDs e
campos administrativos não fazem parte desta proteção.

O envelope é `enc:v1:<base64>`. O conteúdo Base64 concatena nonce aleatório de
12 bytes, ciphertext UTF-8 e tag de autenticação de 16 bytes. A autenticação
inclui a versão e a finalidade `Tabela.Campo` como dados associados. O mesmo
texto produz ciphertext diferente a cada escrita. Null permanece null; string
vazia também é criptografada. Os limites de domínio continuam aplicados ao
plaintext, enquanto as colunas SQLite TEXT acomodam a expansão do envelope.

O cache do modelo EF inclui a identidade do protector para impedir que um
contexto com outra chave reutilize conversores anteriores. Strings são
imutáveis e usam a comparação padrão do EF; uma leitura seguida de SaveChanges
sem alterações não recriptografa dados. Não se habilita logging sensível.

Valores sem prefixo reservado `enc:` são legados e continuam legíveis. Novas
gravações dos campos protegidos são cifradas; registros e campos antigos não
modificados não são reescritos. Envelope inválido, versão desconhecida, chave
errada ou autenticação inválida lança erro genérico sem valor nem inner
exception. Um legado que já começasse com `enc:` será rejeitado.

## Migration e compatibilidade

`20261010171753_PreparePersonalDataProtection` remove limites de comprimento
do modelo de armazenamento dos campos protegidos. Up e Down não executam SQL:
SQLite já usa TEXT, sem alteração física necessária. Designer e snapshot
registram os novos metadados. Nenhum dado é apagado ou criptografado via SQL.

O rollback é apenas estrutural: Down não decifra dados. Uma versão antiga da
aplicação não poderá interpretar ciphertext novo. Planeje restauração da
aplicação e dos dados em conjunto, preservando a chave.

PagBank recebe os valores decifrados pelo fluxo existente; Admin continua sem
expor CPF. Frontend, webhook, reconciliação e financeiro não são modificados.
Os testes usam chaves aleatórias isoladas e bancos SQLite temporários em arquivo.

## Limites e Etapa 2B

Esta proteção não cifra o banco inteiro, memória, navegador, respostas
autorizadas ou backups antigos. Dados legados, WAL e páginas antigas podem
conter plaintext. Não há vinculação à linha: a finalidade impede trocar
campos diferentes, mas não substituir valores entre linhas da mesma coluna.
A compatibilidade legada não permite distinguir plaintext legítimo de um
envelope cujo prefixo foi removido por alguém com acesso de escrita ao banco.
Controle de acesso e integridade do armazenamento continuam necessários.

Ficam para a Etapa 2B: Azure Key Vault, rotação com versionamento e coexistência
de chaves, retenção/anonimização, proteção de backups, limpeza no navegador e
reproteção controlada dos legados. Não substitua a chave atual para simular
rotação: v1 possui uma única chave e isso impediria ler os dados existentes.
