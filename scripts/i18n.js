const LANGUAGE_STORAGE_KEY = "burgerShop:language";

export const SUPPORTED_LANGUAGES = {
  PT_BR: "pt-BR",
  EN_US: "en-US",
};

export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES.PT_BR;

const translations = {
  "pt-BR": {
    "meta.title": "The Burger House - Hamburgueria Artesanal",
    "meta.description":
      "Cardápio digital da The Burger House com hambúrgueres artesanais, acompanhamentos, bebidas, carrinho interativo, entrega e retirada no local.",
    "meta.ogTitle": "The Burger House - Hamburgueria Artesanal",
    "meta.ogDescription":
      "Conheça o cardápio digital da The Burger House, escolha seus produtos, personalize o pedido e finalize pelo WhatsApp.",

    "hero.title": "The Burger House",
    "hero.address": "Rua Dev 25, Uberlândia - MG",
    "hero.hours": "Seg à Dom • 18h às 23h",
    "hero.cta": "Explorar Cardápio",
    "hero.ctaAria": "Ir para o cardápio",

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
    "cart.activeAddAria":
      "{quantity} {unit} de {name} no carrinho. Adicionar mais uma unidade.",
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
    "address.incompleteCep":
      "Não foi possível preencher o endereço completo com esse CEP.",
    "address.connectionError":
      "Erro ao buscar o CEP. Verifique sua conexão e tente novamente.",

    "review.title": "Revisão do Pedido",
    "review.subtitle": "Confirme os dados antes de finalizar",
    "review.items": "Itens do Pedido",
    "review.address": "Endereço de Entrega",
    "review.notes": "Observações do Pedido",
    "review.notesPlaceholder":
      "Ex: sem cebola, carne bem passada, alergia a glúten, enviar ketchup extra...",
    "review.notesHint":
      "Campo opcional. Use para informar preferências, restrições ou alergias.",
    "review.total": "Total Final:",
    "review.finish": "Finalizar",
    "review.empty": "Nenhum item no pedido.",
    "review.addressMissing": "Endereço não informado.",
    "review.orderType": "Tipo de pedido",
    "review.subtotal": "Subtotal",
    "review.deliveryFee": "Taxa de entrega",

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
    "meta.title": "The Burger House - Artisan Burger Shop",
    "meta.description":
      "Digital menu for The Burger House with artisan burgers, sides, drinks, interactive cart, delivery and pickup.",
    "meta.ogTitle": "The Burger House - Artisan Burger Shop",
    "meta.ogDescription":
      "Explore The Burger House digital menu, choose your items, customize your order and finish through WhatsApp.",

    "hero.title": "The Burger House",
    "hero.address": "Dev Street 25, Uberlândia - MG",
    "hero.hours": "Mon to Sun • 6 PM to 11 PM",
    "hero.cta": "Explore Menu",
    "hero.ctaAria": "Go to menu",

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
    "cart.activeAddAria":
      "{quantity} {unit} of {name} in cart. Add one more unit.",
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
    "address.incompleteCep":
      "It was not possible to fill the complete address with this ZIP Code.",
    "address.connectionError":
      "Error searching ZIP Code. Check your connection and try again.",

    "review.title": "Order Review",
    "review.subtitle": "Confirm the details before finishing",
    "review.items": "Order Items",
    "review.address": "Delivery Address",
    "review.notes": "Order Notes",
    "review.notesPlaceholder":
      "Ex: no onion, well-done meat, gluten allergy, send extra ketchup...",
    "review.notesHint":
      "Optional field. Use it to inform preferences, restrictions or allergies.",
    "review.total": "Final Total:",
    "review.finish": "Finish",
    "review.empty": "No items in the order.",
    "review.addressMissing": "Address not provided.",
    "review.orderType": "Order type",
    "review.subtotal": "Subtotal",
    "review.deliveryFee": "Delivery fee",

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
  const normalizedLanguage = isSupportedLanguage(language)
    ? language
    : DEFAULT_LANGUAGE;

  if (hasStorage()) {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, normalizedLanguage);
  }

  return normalizedLanguage;
}

export function translate(key, language = getCurrentLanguage(), replacements = {}) {
  const value =
    translations[language]?.[key] ??
    translations[DEFAULT_LANGUAGE]?.[key] ??
    key;

  return Object.entries(replacements).reduce(
    (text, [placeholder, replacement]) =>
      text.replaceAll(`{${placeholder}}`, String(replacement)),
    value
  );
}

export function translateItemCount(count, language = getCurrentLanguage()) {
  const key = count === 1 ? "cart.itemSingular" : "cart.itemPlural";
  return translate(key, language, { count });
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

  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    element.textContent = translate(key, language);
  });

  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    const key = element.dataset.i18nPlaceholder;
    element.setAttribute("placeholder", translate(key, language));
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    element.setAttribute("aria-label", translate(key, language));
  });

  document.title = translate("meta.title", language);

  const description = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');

  if (description) description.setAttribute("content", translate("meta.description", language));
  if (ogTitle) ogTitle.setAttribute("content", translate("meta.ogTitle", language));
  if (ogDescription) {
    ogDescription.setAttribute("content", translate("meta.ogDescription", language));
  }
}

export function bindLanguageSwitcher(onLanguageChange) {
  if (typeof document === "undefined") return;

  const languageSelect = document.getElementById("language-select");

  if (!languageSelect) return;

  const currentLanguage = getCurrentLanguage();

  languageSelect.value = currentLanguage;

  languageSelect.addEventListener("change", () => {
    const selectedLanguage = setCurrentLanguage(languageSelect.value);
    applyStaticTranslations(selectedLanguage);

    if (typeof onLanguageChange === "function") {
      onLanguageChange(selectedLanguage);
    }
  });
}
