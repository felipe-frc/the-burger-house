# Homologação do portfólio

Esta versão pública resume os procedimentos técnicos dos relatórios operacionais internos. Para reproduzir a homologação, use o [guia local](postgresql-portfolio.md).

| Área | Procedimento reproduzível |
| --- | --- |
| Catálogo | Consultar o catálogo sintético pela vitrine, alterar disponibilidade no Owner e conferir a resposta da API após recarga. |
| Checkout | Criar um pedido com preços calculados pelo servidor. Exercitar entrega e retirada, Pix e crédito contra o provedor local controlado. |
| Conciliação | Validar assinatura do webhook e repetir a notificação. Conferir o pedido, os pagamentos aprovados, estornos e os totais no financeiro. |
| Migração | Importar uma origem SQLite sintética para um destino PostgreSQL vazio. Conferir contagens, hashes, agregados financeiros e sequências. |
| Publicação | Examinar em separado o índice, o histórico, os arquivos locais e o conteúdo do pacote. Manter os relatórios de operação e as credenciais sob acesso restrito. |

Os relatórios datados de fechamento técnico, suporte PagBank, liquidação Pix e manutenção do catálogo de produção são registros internos. Este resumo permite documentar a metodologia sem divulgar transações, valores, identificadores, dados de clientes ou metadados de infraestrutura.
