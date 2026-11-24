# Assets da The Burger House

- Usar nomes em minúsculas e kebab-case em `branding`, `mascots`, `products`, `photography` e `hero` para recursos novos.
- Fotografias, produtos e ilustrações rasterizadas podem usar WebP. Nesta consolidação, a conversão é lossless, com dimensões e pixels RGBA idênticos. O arquivo final deve ser menor que a origem.
- Preservar o pin MapLibre, SVGs vetoriais e o vídeo WebM com alfa. A aparência ou o canal alfa exigem validação específica antes de qualquer troca.
- Medir os maiores tamanhos de exibição antes de introduzir variantes responsivas. Usar poucos tamanhos, `srcset` e `sizes` coerentes. A atual conversão conserva resolução integral para evitar mudança perceptível na baseline.
- Registrar URL anterior, nova URL, tamanho, dimensões e igualdade dos pixels em `audit/consolidation/media-changes.json`.
- Reservar dimensões da imagem no layout. O poster LCP deve carregar com prioridade. Conteúdo abaixo da dobra pode carregar tardiamente, respeitando as animações existentes.
- Originais com consumidores externos ou dinâmicos desconhecidos são preservados. Ausência de import não comprova descarte seguro.
- Backups de banco, fontes editáveis e evidências operacionais têm ciclo de retenção próprio. A curadoria da aplicação não autoriza sua exclusão.

Antes de adicionar um recurso, confirmar licença/proveniência, pesquisar duplicatas por hash, identificar consumidores e testar nos três perfis de tela. Depois da alteração, conferir transparência, recorte, carregamento e aparência lado a lado com a baseline.
