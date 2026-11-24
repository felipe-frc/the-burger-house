const LANGUAGE_STORAGE_KEY = "burgerShop:language";

export const SUPPORTED_LANGUAGES = {
  PT_BR: "pt-BR",
  EN_US: "en-US",
};

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES.PT_BR;

const translations = {
  "pt-BR": {
    "customerReviews.title": "AVALIE SUA EXPERIÊNCIA!",
    "customerReviews.subtitle": "Conta pra gente como foi sua experiência. Sua opinião ajuda a deixar tudo ainda mais saboroso!",
    "customerReviews.goodFood": "COMIDA BOA,",
    "customerReviews.goodMood": "HUMOR BOM!",
    "customerReviews.madeWith": "FEITO COM",
    "customerReviews.love": "CARINHO!",
    "customerReviews.rated": "QUEM AVALIA É VOCÊ!",
    "customerReviews.seal": "SUA OPINIÃO FAZ A DIFERENÇA!",
    "customerReviews.availability": "Prévia do formulário: o envio ainda não está disponível. Nenhum dado será enviado ou salvo.",
    "customerReviews.date": "Data da visita ou pedido",
    "customerReviews.rating": "Sua avaliação",
    "customerReviews.name": "Nome",
    "customerReviews.email": "E-mail",
    "customerReviews.comment": "Conta pra gente!",
    "customerReviews.namePlaceholder": "Como podemos te chamar?",
    "customerReviews.emailPlaceholder": "voce@exemplo.com",
    "customerReviews.commentPlaceholder": "Qual foi a melhor parte do seu pedido?",
    "customerReviews.chooseRating": "Escolha de 1 a 5 estrelas",
    "customerReviews.selectedRating": "Nota selecionada: {rating} de 5",
    "customerReviews.star1": "1 de 5 estrelas",
    "customerReviews.star2": "2 de 5 estrelas",
    "customerReviews.star3": "3 de 5 estrelas",
    "customerReviews.star4": "4 de 5 estrelas",
    "customerReviews.star5": "5 de 5 estrelas",
    "customerReviews.privacy": "Não inclua dados sensíveis no comentário.",
    "customerReviews.submit": "ENVIAR AVALIAÇÃO",
    "customerReviews.sending": "ENVIANDO…",
    "customerReviews.unavailable": "Envio ainda indisponível. Sua avaliação não foi enviada nem salva.",
    "customerReviews.success": "Avaliação recebida. Obrigado por compartilhar sua experiência!",
    "customerReviews.error": "Não foi possível enviar sua avaliação. Tente novamente.",
    "customerReviews.invalidDate": "Informe uma data válida, não futura.",
    "customerReviews.invalidRating": "Escolha uma nota de 1 a 5.",
    "customerReviews.invalidName": "Informe um nome com 2 a 100 caracteres.",
    "customerReviews.invalidEmail": "Informe um e-mail válido com até 254 caracteres.",
    "customerReviews.invalidComment": "Escreva um comentário com 10 a 2.000 caracteres.",
    "featured.sealTraditional": "SELECIONADOS",
    "featured.sealHighlight": "FRESCO",
    "featured.sealPremium": "QUALIDADE",
    "footer.brandLine1": "Hambúrguer de verdade.",
    "footer.brandLine2": "Personalidade em cada mordida.",
    "footer.highlights": "NOSSOS DESTAQUES",
    "footer.reviews": "NOSSA CASA",
    "footer.contact": "CONTATO",
    "footer.delivery": "DELIVERY",
    "footer.rate": "VER CARDÁPIO",
    "footer.order": "PEDIR PELO WHATSAPP",
    "footer.privacy": "POLÍTICA DE PRIVACIDADE",
    "footer.copyright": "© 2026 THE BURGER HOUSE. TODOS OS DIREITOS RESERVADOS.",
    "footer.whatsappAria": "Conversar no WhatsApp",
    "footer.aria": "Rodapé The Burger House",
    "footer.navAria": "Navegação do rodapé",
    "footer.homeAria": "The Burger House - voltar ao início",
    "featured.title": "TRÊS NOVIDADES, TRÊS PERSONALIDADES",
    "featured.intro": "Cada receita tem seu próprio ritmo — sempre com ingredientes selecionados e sabor de verdade.",
    "featured.cta": "VER O CARDÁPIO COMPLETO",
    "featured.chicken":
      "Filé de frango crocante com cheddar derretido, bacon, alface, tomate e maionese defumada.",
    "featured.praiano":
      "Queijo coalho grelhado com fio de mel, banana-da-terra frita, bacon crocante e maionese defumada.",
    "featured.onion":
      "Aioli de alho assado, queijo suíço derretido, bacon e anéis de cebola gigantes crocantes.",
    "privacy.notice":
      "Usamos seus dados para processar o pedido, pagamento e entrega/retirada. O PagBank recebe os dados necessários ao pagamento.",
    "privacy.link": "Política de Privacidade",
    "privacy.checkoutLink": "Política de Privacidade (abre em nova aba)",
    "meta.title": "The Burger House - Hamburgueria Artesanal",
    "meta.description":
      "Cardápio digital da The Burger House com hambúrgueres artesanais, acompanhamentos, bebidas, carrinho interativo, entrega e retirada no local.",
    "meta.ogTitle": "The Burger House - Hamburgueria Artesanal",
    "meta.ogDescription":
      "Conheça o cardápio digital da The Burger House, escolha seus produtos, personalize o pedido e finalize pelo WhatsApp.",

    "hero.title": "The Burger House",
    "hero.address": "Rua Dev 25, Uberlândia - MG",
    "hero.hours": "Segunda a domingo • 18h às 23h",
    "payment.title": "Seu pagamento",
    "payment.approvedTitle": "Pagamento aprovado!",
    "payment.checking": "Consultando confirmação do pagamento...",
    "payment.approved": "Seu pedido foi recebido e já está sendo processado.",
    "payment.pending":
      "Aguardando confirmação do pagamento. Você pode consultar novamente em instantes.",
    "payment.rejected": "Pagamento recusado. Volte à revisão para tentar novamente.",
    "payment.cancelled": "Pagamento cancelado. Volte à revisão para tentar novamente.",
    "payment.refunded": "Pagamento reembolsado.",
    "payment.partialRefund": "Pagamento parcialmente reembolsado.",
    "payment.disputed": "Pagamento contestado. Entre em contato com o restaurante.",
    "payment.unknown": "Status de pagamento não reconhecido.",
    "payment.error":
      "Não foi possível confirmar o pagamento. Consulte novamente antes de repetir a compra.",
    "payment.newOrder": "Fazer novo pedido",
    "payment.check": "Consultar pagamento",
    "payment.whatsapp": "Confirmar pedido pelo WhatsApp",
    "payment.back": "Voltar à revisão",
    "hero.cta": "Explorar Cardápio",
    "hero.ctaAria": "Ir para o cardápio",
    "prettyNav.about": "NOVIDADES",
    "prettyNav.menu": "CARDÁPIO",
    "prettyNav.contact": "NOSSA CASA",
    "prettyNav.delivery": "PEDIR DELIVERY",
    "prettyNav.brandAria": "The Burger House - Início",
    "a11y.skipToContent": "Ir para o conteúdo",
    "menu.eyebrow": "NOSSO CARDÁPIO",
    "menu.titleLocal": "LOCAL,",
    "menu.titleFresh": "FRESCO,",
    "menu.titleTasty": "SABOROSO.",
    "menu.lead": "Pão macio, ingredientes selecionados e receitas feitas para matar a fome de verdade. Simples, caprichado e impossível de esquecer.",
    "menu.categoriesAria": "Categorias do cardápio",
    "menu.category.burgers": "BURGERS",
    "menu.category.sides": "ACOMPANHAMENTOS",
    "menu.category.drinks": "BEBIDAS",
    "menu.productsAria": "Produtos da categoria",
    "menu.ingredients": "INGREDIENTES:",
    "menu.details": "DETALHES:",
    "menu.order": "FAZER PEDIDO",
    "menu.back": "VOLTAR PARA A PÁGINA PRINCIPAL",
    "menu.footerTagline": "HAMBÚRGUER DE VERDADE. PERSONALIDADE EM CADA MORDIDA.",
    "menu.footerOrder": "PEDIR PELO WHATSAPP",
    "menu.metaTitle": "Cardápio | The Burger House",
    "menu.metaDescription": "Cardápio completo da The Burger House: burgers artesanais, acompanhamentos e bebidas.",
    "menu.metaOgDescription": "Conheça os burgers artesanais, acompanhamentos e bebidas da The Burger House.",
    "menu.product.classic.name": "The Classic",
    "menu.product.classic.description": "pão brioche, carne smash, cheddar, cebola, picles e molho da casa.",
    "menu.product.double.name": "Double Smash",
    "menu.product.double.description": "pão brioche, dois smash burgers, cheddar duplo, picles e cebola caramelizada.",
    "menu.product.smokehouse.name": "Smokehouse BBQ",
    "menu.product.smokehouse.description": "pão brioche, carne smash, cheddar, bacon crocante, cebola e barbecue defumado.",
    "menu.product.praiano.name": "O Praiano",
    "menu.product.praiano.description": "queijo coalho, banana-da-terra, bacon crocante e maionese defumada.",
    "menu.product.onion.name": "O Famoso Onion Ring",
    "menu.product.onion.description": "carne smash, queijo suíço, bacon, onion rings e aioli de alho assado.",
    "menu.product.crispy.name": "Crispy Chicken",
    "menu.product.crispy.description": "frango crocante, cheddar, bacon, alface, tomate e maionese defumada.",
    "menu.product.classicFries.name": "Classic Fries",
    "menu.product.classicFries.description": "batatas sequinhas, sal da casa e molho especial à parte.",
    "menu.product.loadedFries.name": "Loaded Fries",
    "menu.product.loadedFries.description": "fritas crocantes, creme de cheddar e cubos de bacon.",
    "menu.product.tenders.name": "Chicken Tenders",
    "menu.product.tenders.description": "tiras de frango empanadas, crocantes por fora e suculentas por dentro.",
    "menu.product.strawberry.name": "Strawberry Soda",
    "menu.product.strawberry.description": "soda artesanal de morango, gelo e aquele toque refrescante da casa.",
    "menu.product.coke.name": "Coca-Cola Original",
    "menu.product.coke.description": "refrigerante Coca-Cola Original, lata de 350 ml servida gelada.",
    "menu.product.cokeZero.name": "Coca-Cola Zero",
    "menu.product.cokeZero.description": "refrigerante Coca-Cola sem açúcar, lata de 350 ml servida gelada.",
    "menu.product.water.name": "Água Mineral",
    "menu.product.water.description": "água mineral sem gás, garrafa de 500 ml servida gelada.",
    "menu.product.sparklingWater.name": "Água com Gás",
    "menu.product.sparklingWater.description": "água mineral com gás, garrafa de 500 ml servida gelada.",
    "menu.product.orangeJuice.name": "Suco de Laranja",
    "menu.product.orangeJuice.description": "suco de laranja refrescante servido bem gelado.",
    "transition.diagonal.fire": "FEITO NA BRASA",
    "transition.diagonal.home": "SABOR DE CASA",
    "transition.diagonal.burgers": "BURGERS INCRÍVEIS",
    "transition.diagonal.craft": "ARTESANAL DE VERDADE",
    "transition.marquee.fire": "SABOR DE BRASA VIVA",
    "transition.marquee.craft": "HAMBÚRGUER ARTESANAL",
    "transition.discover": "Conheça os novos sabores",
    "transition.expandedHeadline": "Três novidades. Um novo favorito.",
    "transition.expandedSubtitle": "Crispy, tropical ou extra crocante: conheça a nova seleção e escolha a sua próxima mordida.",
    "transition.expandedDescription": "Hambúrgueres artesanais, acompanhamentos irresistíveis e muito sabor em cada pedido.",
    "transition.expandedCta": "Conhecer os três",
    "transition.orderCta": "Quero experimentar",
    "transition.edition": "AGORA NA CASA",
    "transition.proofAria": "Diferenciais da casa",
    "transition.proof.brioche": "Pão brioche dourado",
    "transition.proof.ingredients": "Ingredientes selecionados",
    "transition.proof.fresh": "Preparado fresco",
    "transition.productsAria": "Novos hambúrgueres",
    "transition.product.crispy": "Crispy Cheddar",
    "transition.product.praiano": "O Praiano",
    "transition.product.onion": "Onion Crunch",
    "transition.title": "Feito com carinho. Servido com sabor de casa.",
    "transition.description": "Hambúrgueres artesanais, ingredientes especiais e aquele sabor que faz você querer voltar.",
    "transition.cta": "Ver cardápio",
    "transition.pause": "Pausar animação",
    "transition.resume": "Retomar animação",
    "transition.imageAlt": "Três hambúrgueres artesanais da nova campanha.",

    "rebrand.nav.launches": "Novidades",
    "rebrand.nav.menu": "Cardápio",
    "rebrand.nav.about": "A casa",
    "rebrand.nav.order": "Pedir agora",
    "rebrand.hero.title": "Fome não espera.",
    "rebrand.hero.lead": "Três lançamentos, três jeitos de chegar ao ponto. Escolha o seu e deixe o resto com a gente.",
    "rebrand.hero.primary": "Ver cardápio",
    "rebrand.hero.secondary": "Conhecer os lançamentos",
    "rebrand.hero.proof1": "Ingredientes selecionados",
    "rebrand.hero.proof2": "Preparado no seu pedido",
    "rebrand.hero.proof3": "Sabor sem atalho",
    "rebrand.launches.title": "Três novos motivos para voltar.",
    "rebrand.launches.lead": "Cada receita tem uma personalidade. Todas chegam com produto no centro e excesso de sabor.",
    "rebrand.launches.crispy": "Filé de frango crocante, cheddar derretido, bacon, alface, tomate e maionese defumada.",
    "rebrand.launches.crispyNote": "Crocante por fora. Suculento até o fim.",
    "rebrand.launches.praiano": "Queijo coalho grelhado, fio de mel, banana-da-terra, bacon crocante e maionese defumada.",
    "rebrand.launches.praianoNote": "Doce, salgado e defumado no mesmo ritmo.",
    "rebrand.launches.onion": "Aioli de alho assado, queijo suíço, bacon e anéis de cebola gigantes e crocantes.",
    "rebrand.launches.onionNote": "Grande no tamanho. Maior ainda no sabor.",
    "rebrand.menu.title": "O burger é só o começo.",
    "rebrand.menu.lead": "Complete do seu jeito: crocância, queijo, algo gelado e a mesa está pronta.",
    "rebrand.menu.cta": "Explorar tudo",
    "rebrand.menu.loaded": "Fritas, cheddar cremoso e bacon.",
    "rebrand.menu.soda": "Morango, gelo e refrescância.",
    "rebrand.menu.tenders": "Crocantes e suculentos.",
    "rebrand.menu.juice": "Gelado e direto ao ponto.",
    "rebrand.about.title": "Uma casa feita para comer bem e ficar à vontade.",
    "rebrand.about.text": "Receitas com personalidade, ingredientes selecionados e atendimento sem complicação. A The Burger House existe para transformar uma fome comum em um momento que vale repetir.",
    "rebrand.about.value1": "Produto de verdade",
    "rebrand.about.value2": "Preparo cuidadoso",
    "rebrand.about.value3": "Hospitalidade sem pose",
    "rebrand.careers.title": "Quer trabalhar com a gente?",
    "rebrand.careers.text": "Se você gosta de cozinha, atendimento e ritmo de equipe, queremos conhecer você.",
    "rebrand.careers.cta": "Falar com a equipe",
    "rebrand.footer.line": "Burger sério. Ambiente leve.",
    "rebrand.footer.order": "Pedir pelo WhatsApp",

    "house.title": "Uma burger house feita para ficar na memória",
    "house.lead": "Sabor marcante, ambiente descontraído e receitas com personalidade. Aqui, cada pedido é preparado para transformar a pausa do dia em um bom momento.",
    "house.galleryAria": "Ambiente e cozinha da The Burger House",
    "house.roomAlt": "Salão da The Burger House com mesas e iluminação acolhedora",
    "house.kitchenAlt": "Ingredientes de um hambúrguer sendo montados",
    "house.qualitiesAria": "Compromissos da casa",
    "house.quality.selected": "Ingredientes selecionados",
    "house.quality.selectedText": "Combinações pensadas para equilibrar textura, frescor e sabor.",
    "house.quality.fresh": "Feito fresco",
    "house.quality.freshText": "Cada burger ganha forma no ritmo do seu pedido.",
    "house.quality.personality": "Qualidade com personalidade",
    "house.quality.personalityText": "Receitas autorais com a energia de uma burger house americana.",
    "house.careersTitle": "Venha fazer parte da nossa equipe",
    "house.careersText": "Gosta de hospitalidade, ritmo de cozinha e de fazer cada experiência valer a visita? Queremos conhecer você.",
    "house.careersCta": "Falar com a equipe",

    "nav.aria": "Navegação por categorias do cardápio",
    "nav.burgers": "Hambúrgueres",
    "nav.sides": "Acompanhamentos",
    "nav.drinks": "Bebidas",

    "cart.title": "Meu Carrinho",
    "cart.selected": "selecionados",
    "cart.emptyCount": "0 itens",
    "cart.emptyTitle": "Seu carrinho está vazio",
    "cart.emptyDescription": "Adicione itens do cardápio para continuar.",
    "cart.subtotal": "Subtotal dos itens",
    "cart.deliveryHint": "Entrega: R$ 5,00 | Retirada no local: grátis",
    "cart.back": "Voltar",
    "cart.continue": "Continuar",
    "cart.footer": "Meu Carrinho",
    "cart.openAria": "Abrir carrinho",
    "cart.closeAria": "Fechar",
    "cart.unitPriceSuffix": "cada",
    "cart.remove": "Remover",
    "cart.removeAria": "Remover {name} do carrinho",
    "cart.decreaseAria": "Diminuir quantidade de {name}",
    "cart.increaseAria": "Aumentar quantidade de {name}",
    "cart.addAria": "Adicionar {name} ao carrinho",
    "cart.activeAddAria": "{quantity} {unit} de {name} no carrinho. Adicionar mais uma unidade.",
    "cart.unitSingular": "unidade",
    "cart.unitPlural": "unidades",
    "cart.itemSingular": "{count} item",
    "cart.itemPlural": "{count} itens",
    "cart.addedToast": "{name} adicionado ao carrinho!",
    "cart.emptyToast": "Seu carrinho está vazio.",
    "cart.needItemToast": "Adicione pelo menos 1 item ao carrinho para continuar.",

    "orderType.title": "Tipo de Pedido",
    "orderType.subtitle": "Escolha entrega ou retirada",
    "orderType.question": "Como deseja receber o pedido?",
    "orderType.delivery": "Entrega",
    "orderType.deliveryDescription": "Receber no endereço informado",
    "orderType.pickup": "Retirada no local",
    "orderType.pickupDescription": "Buscar diretamente na hamburgueria",

    "address.cep": "CEP*",
    "address.cepPlaceholder": "00000-000",
    "address.loadingCep": "Buscando CEP...",
    "address.street": "Rua*",
    "address.streetHint": "Preenchido via CEP",
    "address.number": "Número*",
    "address.numberPlaceholder": "Ex: 123",
    "address.neighborhood": "Bairro*",
    "address.neighborhoodHint": "Via CEP",
    "address.city": "Cidade*",
    "address.cityHint": "Via CEP",
    "address.complement": "Complemento (Opcional)",
    "address.complementPlaceholder": "Apto, Bloco, etc.",
    "address.pickupSelected": "Retirada no local selecionada",
    "address.pickupMessage":
      "O pedido será preparado para retirada no balcão da The Burger House. Nenhuma taxa de entrega será aplicada.",
    "address.requiredFields": "Preencha os campos obrigatórios (*)",
    "address.pickupPrefix": "Retirada no local",
    "address.complementPrefix": "Complemento",
    "address.waitCep": "Aguarde a busca do CEP terminar.",
    "address.invalidCep":
      "Preencha os campos obrigatórios e informe um CEP válido para carregar o endereço.",
    "address.invalidNumber": "Informe um número válido usando apenas dígitos.",
    "address.fetchFailed": "Falha ao consultar o CEP.",
    "address.notFound": "CEP não encontrado. Verifique o número informado.",
    "address.incompleteCep": "Não foi possível preencher o endereço completo com esse CEP.",
    "address.connectionError": "Erro ao buscar o CEP. Verifique sua conexão e tente novamente.",

    "review.title": "Revisão do Pedido",
    "review.subtitle": "Confirme os dados antes de finalizar",
    "review.items": "Itens do Pedido",
    "review.address": "Endereço de Entrega",
    "review.notes": "Observações do Pedido",
    "review.notesPlaceholder":
      "Ex: sem cebola, carne bem passada, alergia a glúten, enviar ketchup extra...",
    "review.notesHint": "Campo opcional. Use para informar preferências, restrições ou alergias.",
    "review.total": "Total Final:",
    "review.finish": "Finalizar",
    "review.empty": "Nenhum item no pedido.",
    "review.addressMissing": "Endereço não informado.",
    "review.orderType": "Tipo de pedido",
    "review.subtotal": "Subtotal",
    "review.deliveryFee": "Taxa de entrega",

    "address.customerName": "Nome*",
    "address.customerPhone": "Telefone com DDD*",
    "address.customerEmail": "E-mail*",
    "address.customerTaxId": "CPF*",
    "address.invalidEmail": "Informe um e-mail válido.",
    "address.invalidPhone": "Informe um celular válido com DDD.",
    "address.invalidCpf": "Informe um CPF válido.",
    "address.customerRequired": "Informe seu nome e um telefone válido com DDD.",
    "whatsapp.newOrder": "Novo Pedido - The Burger House",
    "whatsapp.orderType": "Tipo de pedido",
    "whatsapp.items": "Itens do pedido",
    "whatsapp.summary": "Resumo",
    "whatsapp.subtotal": "Subtotal",
    "whatsapp.deliveryFee": "Taxa de entrega",
    "whatsapp.total": "Total",
    "whatsapp.pickupAddress": "Retirada no local",
    "whatsapp.deliveryAddress": "Endereço de entrega",
    "whatsapp.notes": "Observações do pedido",

    "status.open": "Aberto agora",
    "status.closed": "Fechado no momento",
    "status.closedMessage": "Estamos fechados no momento. Funcionamos das 18h às 23h.",

    "order.sending": "Enviando pedido...",
    "order.sentToast": "Pedido enviado! Seu carrinho foi limpo.",

    "language.label": "Idioma",
  },

  "en-US": {
    "customerReviews.title": "RATE YOUR BURGER EXPERIENCE!",
    "customerReviews.subtitle": "Tell us about your experience. Your feedback helps us make every bite even better!",
    "customerReviews.goodFood": "GOOD FOOD,",
    "customerReviews.goodMood": "GOOD MOOD!",
    "customerReviews.madeWith": "MADE WITH",
    "customerReviews.love": "LOVE!",
    "customerReviews.rated": "RATED BY YOU!",
    "customerReviews.seal": "YOUR OPINION MAKES A DIFFERENCE!",
    "customerReviews.availability": "Form preview: submissions are not available yet. No data will be sent or saved.",
    "customerReviews.date": "Visit or order date",
    "customerReviews.rating": "Your rating",
    "customerReviews.name": "Name",
    "customerReviews.email": "Email",
    "customerReviews.comment": "Tell us about it!",
    "customerReviews.namePlaceholder": "What should we call you?",
    "customerReviews.emailPlaceholder": "you@example.com",
    "customerReviews.commentPlaceholder": "What was the best part of your order?",
    "customerReviews.chooseRating": "Choose 1 to 5 stars",
    "customerReviews.selectedRating": "Selected rating: {rating} out of 5",
    "customerReviews.star1": "1 out of 5 stars",
    "customerReviews.star2": "2 out of 5 stars",
    "customerReviews.star3": "3 out of 5 stars",
    "customerReviews.star4": "4 out of 5 stars",
    "customerReviews.star5": "5 out of 5 stars",
    "customerReviews.privacy": "Do not include sensitive information in your comment.",
    "customerReviews.submit": "SEND REVIEW",
    "customerReviews.sending": "SENDING…",
    "customerReviews.unavailable": "Submissions are not available yet. Your review was not sent or saved.",
    "customerReviews.success": "Review received. Thank you for sharing your experience!",
    "customerReviews.error": "We could not send your review. Please try again.",
    "customerReviews.invalidDate": "Enter a valid date that is not in the future.",
    "customerReviews.invalidRating": "Choose a rating from 1 to 5.",
    "customerReviews.invalidName": "Enter a name with 2 to 100 characters.",
    "customerReviews.invalidEmail": "Enter a valid email with up to 254 characters.",
    "customerReviews.invalidComment": "Write a comment with 10 to 2,000 characters.",
    "featured.sealTraditional": "SELECTED",
    "featured.sealHighlight": "FRESH",
    "featured.sealPremium": "QUALITY",
    "footer.brandLine1": "Real handcrafted burgers.",
    "footer.brandLine2": "Personality in every bite.",
    "footer.highlights": "OUR FAVORITES",
    "footer.reviews": "OUR HOUSE",
    "footer.contact": "CONTACT",
    "footer.delivery": "DELIVERY",
    "footer.rate": "SEE THE MENU",
    "footer.order": "ORDER VIA WHATSAPP",
    "footer.privacy": "PRIVACY POLICY",
    "footer.copyright": "© 2026 THE BURGER HOUSE. ALL RIGHTS RESERVED.",
    "footer.whatsappAria": "Chat on WhatsApp",
    "footer.aria": "The Burger House footer",
    "footer.navAria": "Footer navigation",
    "footer.homeAria": "The Burger House - back to home",
    "featured.title": "THREE NEW BURGERS, THREE PERSONALITIES",
    "featured.intro": "Each recipe has its own rhythm — always with selected ingredients and real flavor.",
    "featured.cta": "SEE THE FULL MENU",
    "featured.chicken":
      "Crispy chicken fillet with melted cheddar, bacon, lettuce, tomato and smoked mayo.",
    "featured.praiano":
      "Grilled coalho cheese with a drizzle of honey, fried plantain, crispy bacon and smoked mayo.",
    "featured.onion":
      "Roasted garlic aioli, melted Swiss cheese, bacon and giant crispy onion rings.",
    "privacy.notice":
      "We use your data to process your order, payment and delivery/pickup. PagBank receives the data needed to process payment.",
    "privacy.link": "Privacy Policy (Portuguese)",
    "privacy.checkoutLink": "Privacy Policy (Portuguese, opens in a new tab)",
    "meta.title": "The Burger House - Artisan Burgers",
    "meta.description":
      "Digital menu for The Burger House with artisan burgers, sides, drinks, interactive cart, delivery and pickup.",
    "meta.ogTitle": "The Burger House - Artisan Burgers",
    "meta.ogDescription":
      "Explore The Burger House digital menu, choose your items, customize your order and finish through WhatsApp.",

    "hero.title": "The Burger House",
    "hero.address": "Dev Street 25, Uberlândia - MG",
    "hero.hours": "Monday to Sunday • 6 PM to 11 PM",
    "payment.title": "Your payment",
    "payment.approvedTitle": "Payment approved!",
    "payment.checking": "Checking payment confirmation...",
    "payment.approved": "Your order has been received and is being processed.",
    "payment.pending": "Waiting for payment confirmation. You can check again shortly.",
    "payment.rejected": "Payment declined. Go back to review to try again.",
    "payment.cancelled": "Payment cancelled. Go back to review to try again.",
    "payment.refunded": "Payment refunded.",
    "payment.partialRefund": "Payment partially refunded.",
    "payment.disputed": "Payment disputed. Please contact the restaurant.",
    "payment.unknown": "Unrecognized payment status.",
    "payment.error": "Unable to confirm payment. Check again before repeating the purchase.",
    "payment.newOrder": "Place a new order",
    "payment.check": "Check payment",
    "payment.whatsapp": "Confirm order via WhatsApp",
    "payment.back": "Back to review",
    "hero.cta": "Explore Menu",
    "hero.ctaAria": "Go to menu",
    "prettyNav.about": "NEW BURGERS",
    "prettyNav.menu": "MENU",
    "prettyNav.contact": "OUR HOUSE",
    "prettyNav.delivery": "ORDER DELIVERY",
    "prettyNav.brandAria": "The Burger House - Home",
    "a11y.skipToContent": "Skip to content",
    "menu.eyebrow": "OUR MENU",
    "menu.titleLocal": "LOCAL,",
    "menu.titleFresh": "FRESH,",
    "menu.titleTasty": "DELICIOUS.",
    "menu.lead": "Soft buns, selected ingredients, and recipes made to satisfy a real appetite. Simple, carefully prepared, and impossible to forget.",
    "menu.categoriesAria": "Menu categories",
    "menu.category.burgers": "BURGERS",
    "menu.category.sides": "SIDES",
    "menu.category.drinks": "DRINKS",
    "menu.productsAria": "Products in this category",
    "menu.ingredients": "INGREDIENTS:",
    "menu.details": "DETAILS:",
    "menu.order": "PLACE AN ORDER",
    "menu.back": "BACK TO THE HOME PAGE",
    "menu.footerTagline": "REAL BURGERS. PERSONALITY IN EVERY BITE.",
    "menu.footerOrder": "ORDER VIA WHATSAPP",
    "menu.metaTitle": "Menu | The Burger House",
    "menu.metaDescription": "The Burger House full menu: handcrafted burgers, sides, and drinks.",
    "menu.metaOgDescription": "Explore The Burger House handcrafted burgers, sides, and drinks.",
    "menu.product.classic.name": "The Classic",
    "menu.product.classic.description": "brioche bun, smash patty, cheddar, onion, pickles, and house sauce.",
    "menu.product.double.name": "Double Smash",
    "menu.product.double.description": "brioche bun, two smash patties, double cheddar, pickles, and caramelized onion.",
    "menu.product.smokehouse.name": "Smokehouse BBQ",
    "menu.product.smokehouse.description": "brioche bun, smash patty, cheddar, crispy bacon, onion, and smoky barbecue sauce.",
    "menu.product.praiano.name": "O Praiano",
    "menu.product.praiano.description": "grilled coalho cheese, plantain, crispy bacon, and smoked mayo.",
    "menu.product.onion.name": "The Famous Onion Ring",
    "menu.product.onion.description": "smash patty, Swiss cheese, bacon, onion rings, and roasted garlic aioli.",
    "menu.product.crispy.name": "Crispy Chicken",
    "menu.product.crispy.description": "crispy chicken, cheddar, bacon, lettuce, tomato, and smoked mayo.",
    "menu.product.classicFries.name": "Classic Fries",
    "menu.product.classicFries.description": "crispy fries, house salt, and special sauce on the side.",
    "menu.product.loadedFries.name": "Loaded Fries",
    "menu.product.loadedFries.description": "crispy fries, creamy cheddar, and bacon cubes.",
    "menu.product.tenders.name": "Chicken Tenders",
    "menu.product.tenders.description": "breaded chicken strips, crispy outside and juicy inside.",
    "menu.product.strawberry.name": "Strawberry Soda",
    "menu.product.strawberry.description": "house strawberry soda, ice, and a refreshing finishing touch.",
    "menu.product.coke.name": "Coca-Cola Original",
    "menu.product.coke.description": "350 ml can of Coca-Cola Original, served chilled.",
    "menu.product.cokeZero.name": "Coca-Cola Zero",
    "menu.product.cokeZero.description": "350 ml can of sugar-free Coca-Cola, served chilled.",
    "menu.product.water.name": "Still Water",
    "menu.product.water.description": "500 ml bottle of still mineral water, served chilled.",
    "menu.product.sparklingWater.name": "Sparkling Water",
    "menu.product.sparklingWater.description": "500 ml bottle of sparkling mineral water, served chilled.",
    "menu.product.orangeJuice.name": "Orange Juice",
    "menu.product.orangeJuice.description": "refreshing orange juice served well chilled.",
    "transition.diagonal.fire": "FLAME GRILLED",
    "transition.diagonal.home": "A TASTE OF HOME",
    "transition.diagonal.burgers": "AMAZING BURGERS",
    "transition.diagonal.craft": "TRULY HANDCRAFTED",
    "transition.marquee.fire": "LIVE FIRE FLAVOR",
    "transition.marquee.craft": "CRAFT BURGERS",
    "transition.discover": "Discover the new flavors",
    "transition.expandedHeadline": "Three new burgers. One new favorite.",
    "transition.expandedSubtitle": "Crispy, tropical or extra crunchy: meet the new selection and choose your next bite.",
    "transition.expandedDescription": "Handcrafted burgers, irresistible sides, and delicious flavor in every order.",
    "transition.expandedCta": "Meet all three",
    "transition.orderCta": "I want to try them",
    "transition.edition": "NOW AT THE HOUSE",
    "transition.proofAria": "What makes our burgers different",
    "transition.proof.brioche": "Golden brioche bun",
    "transition.proof.ingredients": "Selected ingredients",
    "transition.proof.fresh": "Freshly prepared",
    "transition.productsAria": "New burgers",
    "transition.product.crispy": "Crispy Cheddar",
    "transition.product.praiano": "O Praiano",
    "transition.product.onion": "Onion Crunch",
    "transition.title": "Made with care. Served with a taste of home.",
    "transition.description": "Handcrafted burgers, special ingredients, and flavors worth coming back for.",
    "transition.cta": "View menu",
    "transition.pause": "Pause animation",
    "transition.resume": "Resume animation",
    "transition.imageAlt": "Three handcrafted burgers from the new campaign.",

    "rebrand.nav.launches": "New burgers",
    "rebrand.nav.menu": "Menu",
    "rebrand.nav.about": "Our house",
    "rebrand.nav.order": "Order now",
    "rebrand.hero.title": "Hunger won't wait.",
    "rebrand.hero.lead": "Three new burgers, three ways to hit the spot. Pick yours and leave the rest to us.",
    "rebrand.hero.primary": "See the menu",
    "rebrand.hero.secondary": "Meet the new burgers",
    "rebrand.hero.proof1": "Selected ingredients",
    "rebrand.hero.proof2": "Made for your order",
    "rebrand.hero.proof3": "No shortcuts on flavor",
    "rebrand.launches.title": "Three new reasons to come back.",
    "rebrand.launches.lead": "Every recipe has a personality. Each one puts the product first and turns the flavor all the way up.",
    "rebrand.launches.crispy": "Crispy chicken fillet, melted cheddar, bacon, lettuce, tomato and smoked mayo.",
    "rebrand.launches.crispyNote": "Crisp outside. Juicy to the last bite.",
    "rebrand.launches.praiano": "Grilled coalho cheese, honey, plantain, crispy bacon and smoked mayo.",
    "rebrand.launches.praianoNote": "Sweet, savory and smoky in the same rhythm.",
    "rebrand.launches.onion": "Roasted garlic aioli, Swiss cheese, bacon and giant crispy onion rings.",
    "rebrand.launches.onionNote": "Big in size. Even bigger in flavor.",
    "rebrand.menu.title": "The burger is just the start.",
    "rebrand.menu.lead": "Build it your way: crunch, cheese, something cold and the table is ready.",
    "rebrand.menu.cta": "Explore everything",
    "rebrand.menu.loaded": "Fries, creamy cheddar and bacon.",
    "rebrand.menu.soda": "Strawberry, ice and refreshment.",
    "rebrand.menu.tenders": "Crispy and juicy.",
    "rebrand.menu.juice": "Cold and straight to the point.",
    "rebrand.about.title": "A place made for eating well and feeling at home.",
    "rebrand.about.text": "Recipes with personality, selected ingredients and uncomplicated service. The Burger House turns an ordinary appetite into a moment worth repeating.",
    "rebrand.about.value1": "Real product",
    "rebrand.about.value2": "Careful preparation",
    "rebrand.about.value3": "Hospitality without the attitude",
    "rebrand.careers.title": "Want to work with us?",
    "rebrand.careers.text": "If you enjoy kitchens, service and working at pace with a team, we want to meet you.",
    "rebrand.careers.cta": "Talk to the team",
    "rebrand.footer.line": "Serious burgers. Easy atmosphere.",
    "rebrand.footer.order": "Order on WhatsApp",

    "house.title": "A burger house made to be remembered",
    "house.lead": "Bold flavor, a relaxed atmosphere and recipes with personality. Every order is prepared to turn a break in your day into a good moment.",
    "house.galleryAria": "The Burger House dining room and kitchen",
    "house.roomAlt": "The Burger House dining room with tables and warm lighting",
    "house.kitchenAlt": "Burger ingredients being assembled",
    "house.qualitiesAria": "Our commitments",
    "house.quality.selected": "Selected ingredients",
    "house.quality.selectedText": "Combinations designed to balance texture, freshness and flavor.",
    "house.quality.fresh": "Made fresh",
    "house.quality.freshText": "Every burger comes together at the pace of your order.",
    "house.quality.personality": "Quality with personality",
    "house.quality.personalityText": "Original recipes with the energy of an American burger house.",
    "house.careersTitle": "Come join our team",
    "house.careersText": "Do you enjoy hospitality, the rhythm of a kitchen and making every visit count? We want to meet you.",
    "house.careersCta": "Talk to our team",

    "nav.aria": "Menu category navigation",
    "nav.burgers": "Burgers",
    "nav.sides": "Sides",
    "nav.drinks": "Drinks",

    "cart.title": "My Cart",
    "cart.selected": "selected",
    "cart.emptyCount": "0 items",
    "cart.emptyTitle": "Your cart is empty",
    "cart.emptyDescription": "Add menu items to continue.",
    "cart.subtotal": "Items subtotal",
    "cart.deliveryHint": "Delivery: R$ 5.00 | Pickup: free",
    "cart.back": "Back",
    "cart.continue": "Continue",
    "cart.footer": "My Cart",
    "cart.openAria": "Open cart",
    "cart.closeAria": "Close",
    "cart.unitPriceSuffix": "each",
    "cart.remove": "Remove",
    "cart.removeAria": "Remove {name} from cart",
    "cart.decreaseAria": "Decrease quantity of {name}",
    "cart.increaseAria": "Increase quantity of {name}",
    "cart.addAria": "Add {name} to cart",
    "cart.activeAddAria": "{quantity} {unit} of {name} in cart. Add one more unit.",
    "cart.unitSingular": "unit",
    "cart.unitPlural": "units",
    "cart.itemSingular": "{count} item",
    "cart.itemPlural": "{count} items",
    "cart.addedToast": "{name} added to cart!",
    "cart.emptyToast": "Your cart is empty.",
    "cart.needItemToast": "Add at least 1 item to the cart to continue.",

    "orderType.title": "Order Type",
    "orderType.subtitle": "Choose delivery or pickup",
    "orderType.question": "How would you like to receive your order?",
    "orderType.delivery": "Delivery",
    "orderType.deliveryDescription": "Receive at the provided address",
    "orderType.pickup": "Pickup",
    "orderType.pickupDescription": "Pick up directly at the burger shop",

    "address.cep": "ZIP Code*",
    "address.cepPlaceholder": "00000-000",
    "address.loadingCep": "Searching ZIP Code...",
    "address.street": "Street*",
    "address.streetHint": "Filled through ZIP Code",
    "address.number": "Number*",
    "address.numberPlaceholder": "Ex: 123",
    "address.neighborhood": "Neighborhood*",
    "address.neighborhoodHint": "Via ZIP Code",
    "address.city": "City*",
    "address.cityHint": "Via ZIP Code",
    "address.complement": "Complement (Optional)",
    "address.complementPlaceholder": "Apartment, Block, etc.",
    "address.pickupSelected": "Pickup selected",
    "address.pickupMessage":
      "The order will be prepared for pickup at The Burger House counter. No delivery fee will be applied.",
    "address.requiredFields": "Fill in the required fields (*)",
    "address.pickupPrefix": "Pickup",
    "address.complementPrefix": "Complement",
    "address.waitCep": "Wait until ZIP Code search finishes.",
    "address.invalidCep":
      "Fill in the required fields and enter a valid ZIP Code to load the address.",
    "address.invalidNumber": "Enter a valid number using digits only.",
    "address.fetchFailed": "Failed to search ZIP Code.",
    "address.notFound": "ZIP Code not found. Check the entered number.",
    "address.incompleteCep": "It was not possible to fill the complete address with this ZIP Code.",
    "address.connectionError": "Error searching ZIP Code. Check your connection and try again.",

    "review.title": "Order Review",
    "review.subtitle": "Confirm the details before finishing",
    "review.items": "Order Items",
    "review.address": "Delivery Address",
    "review.notes": "Order Notes",
    "review.notesPlaceholder":
      "Ex: no onion, well-done meat, gluten allergy, send extra ketchup...",
    "review.notesHint": "Optional field. Use it to inform preferences, restrictions or allergies.",
    "review.total": "Final Total:",
    "review.finish": "Finish",
    "review.empty": "No items in the order.",
    "review.addressMissing": "Address not provided.",
    "review.orderType": "Order type",
    "review.subtotal": "Subtotal",
    "review.deliveryFee": "Delivery fee",

    "address.customerName": "Name*",
    "address.customerPhone": "Phone with area code*",
    "address.customerEmail": "Email*",
    "address.customerTaxId": "CPF*",
    "address.invalidEmail": "Enter a valid email address.",
    "address.invalidPhone": "Enter a valid mobile phone number with area code.",
    "address.invalidCpf": "Enter a valid CPF (Brazilian tax ID).",
    "address.customerRequired": "Enter your name and a valid phone number with area code.",
    "whatsapp.newOrder": "New Order - The Burger House",
    "whatsapp.orderType": "Order type",
    "whatsapp.items": "Order items",
    "whatsapp.summary": "Summary",
    "whatsapp.subtotal": "Subtotal",
    "whatsapp.deliveryFee": "Delivery fee",
    "whatsapp.total": "Total",
    "whatsapp.pickupAddress": "Pickup",
    "whatsapp.deliveryAddress": "Delivery address",
    "whatsapp.notes": "Order notes",

    "status.open": "Open now",
    "status.closed": "Closed now",
    "status.closedMessage": "We are currently closed. Opening hours: 6 PM to 11 PM.",

    "order.sending": "Sending order...",
    "order.sentToast": "Order sent! Your cart has been cleared.",

    "language.label": "Language",
  },
};

function hasStorage() {
  return typeof localStorage !== "undefined";
}

export function isSupportedLanguage(language) {
  return Object.values(SUPPORTED_LANGUAGES).includes(language);
}

export function getCurrentLanguage() {
  if (!hasStorage()) return DEFAULT_LANGUAGE;

  const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);

  if (isSupportedLanguage(savedLanguage)) {
    return savedLanguage;
  }

  return DEFAULT_LANGUAGE;
}

function setCurrentLanguage(language) {
  const normalizedLanguage = isSupportedLanguage(language) ? language : DEFAULT_LANGUAGE;

  if (hasStorage()) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
  }

  return normalizedLanguage;
}

export function translate(key, language = getCurrentLanguage(), replacements = {}) {
  const value = translations[language]?.[key] ?? translations[DEFAULT_LANGUAGE]?.[key] ?? key;

  return Object.entries(replacements).reduce(
    (text, [placeholder, replacement]) => text.replaceAll(`{${placeholder}}`, String(replacement)),
    value,
  );
}

export function translateItemCount(count, language = getCurrentLanguage()) {
  const key = count === 1 ? "cart.itemSingular" : "cart.itemPlural";

  return translate(key, language, {
    count,
  });
}

export function getLocalizedEntity(entity, language = getCurrentLanguage()) {
  if (!entity) return entity;

  return {
    ...entity,
    ...(entity.translations?.[language] ?? {}),
  };
}

export function applyStaticTranslations(language = getCurrentLanguage()) {
  if (typeof document === "undefined") return;

  const htmlLang = language === SUPPORTED_LANGUAGES.EN_US ? "en" : "pt-BR";

  document.documentElement.lang = htmlLang;

  const translatedElements = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[data-i18n]")
  );

  translatedElements.forEach((element) => {
    const key = element.dataset.i18n;

    if (!key) return;

    element.textContent = translate(key, language);
    if (key === "hero.hours") {
      const [days, hours] = translate(key, language).split(" • ");
      const separator = document.createElement("span");
      separator.className = "px-1 text-[#ffd340]";
      separator.textContent = "•";
      element.replaceChildren(`${days} `, separator, ` ${hours}`);
    }
  });

  const placeholderElements = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[data-i18n-placeholder]")
  );

  placeholderElements.forEach((element) => {
    const key = element.dataset.i18nPlaceholder;

    if (!key) return;

    element.setAttribute("placeholder", translate(key, language));
  });

  const ariaLabelElements = /** @type {NodeListOf<HTMLElement>} */ (
    document.querySelectorAll("[data-i18n-aria-label]")
  );

  ariaLabelElements.forEach((element) => {
    const key = element.dataset.i18nAriaLabel;

    if (!key) return;

    element.setAttribute("aria-label", translate(key, language));
  });

  document.querySelectorAll("[data-i18n-alt]").forEach((element) => {
    const key = element.getAttribute("data-i18n-alt");
    if (key) element.setAttribute("alt", translate(key, language));
  });
  document.title = translate("meta.title", language);

  const description = document.querySelector('meta[name="description"]');

  const ogTitle = document.querySelector('meta[property="og:title"]');

  const ogDescription = document.querySelector('meta[property="og:description"]');

  if (description) {
    description.setAttribute("content", translate("meta.description", language));
  }

  if (ogTitle) {
    ogTitle.setAttribute("content", translate("meta.ogTitle", language));
  }

  if (ogDescription) {
    ogDescription.setAttribute("content", translate("meta.ogDescription", language));
  }
}

export function bindLanguageSwitcher(onLanguageChange) {
  if (typeof document === "undefined") return;

  const currentLanguage = getCurrentLanguage();

  const languageSelect = /** @type {HTMLSelectElement | null} */ (
    document.getElementById("language-select")
  );

  if (!languageSelect) return;

  const handleLanguageChange = (selectedLanguage) => {
    const newLang = setCurrentLanguage(selectedLanguage);

    applyStaticTranslations(newLang);

    if (typeof onLanguageChange === "function") {
      onLanguageChange(newLang);
    }
  };

  languageSelect.value = currentLanguage;

  languageSelect.addEventListener("change", () => {
    handleLanguageChange(languageSelect.value);
  });
}
