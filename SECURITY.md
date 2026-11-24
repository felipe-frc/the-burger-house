# Segurança e publicação

Reporte vulnerabilidades em canal privado ao mantenedor. Envie a descrição, o impacto e uma reprodução com dados sintéticos. Remova credenciais, cookies, dados pessoais e transações reais antes de compartilhar evidências.

As configurações de servidor pertencem ao ambiente de cada instalação. Use os arquivos `.env.example`, um gerenciador de segredos e credenciais independentes por estabelecimento. Variáveis `VITE_*` são públicas no navegador.

Antes de preparar uma publicação, execute os comandos abaixo. O primeiro verifica o índice real e os caminhos privados no histórico acessível. Os demais precisam do Gitleaks instalado e examinam o índice e o histórico. Examine também os arquivos locais novos antes de prepará-los.

```powershell
python scripts/check-publication.py --history
gitleaks git --staged --redact=100 --config .gitleaks.toml
gitleaks git --log-opts="--all" --redact=100 --config .gitleaks.toml
```

O arquivo `publication-policy.json` registra os caminhos internos conhecidos. Seus arquivos locais são preservados. O `.gitignore` evita sua inclusão acidental. A verificação de conteúdo deve incluir dados operacionais e a proveniência de capturas, além de padrões de credenciais.

Uma ocorrência privada no histórico bloqueia a publicação até revisão e autorização específica de saneamento. Alterar o índice ou o `.gitignore` preserva os objetos históricos. Credenciais confirmadas como expostas exigem revogação ou rotação pelo responsável.

Consulte [homologação pública](docs/homologacao-publica.md) para os procedimentos técnicos com dados sintéticos.
