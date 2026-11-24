import { useEffect, useRef, type InputHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, MapPin, Minus, Plus, RefreshCw, ShoppingBag, Store, Trash2, Truck, X } from 'lucide-react';
import { formatBRL, type CartItem } from '../utils/menu';
import type { StorefrontCatalog } from '../utils/useStorefrontCatalog';
import { englishMenuCopy } from '../utils/menuCopy';
import { useModalFocus } from '../utils/useModalFocus';
import { formatCep, formatCpf, formatPhone, STORE_CONFIG, type CheckoutForm, type PaymentStatusName } from '../checkout/model';
import { useCheckout, type CepState, type Notice } from '../checkout/useCheckout';
import './OrderDrawer.css';
import { productImage } from '../utils/productImage';
import { publicWhatsAppNumber } from '../privacy/publicContact';

interface OrderDrawerProps {
  isOpen: boolean; onClose: () => void; cart: CartItem[]; onUpdateCart: (cart: CartItem[]) => void;
  initialMode?: 'takeaway' | 'delivery'; currentLang?: string; onOpen: () => void; onBrowseMenu: () => void;
  storefrontCatalog: StorefrontCatalog;
  onTotalChange: (total: number | null) => void;
}
const notices: Record<Exclude<Notice, ''>, [string, string]> = {
  catalog: ['Não foi possível conferir o catálogo. Tente novamente antes de continuar.', 'Could not verify the catalog. Retry before continuing.'],
  cart: ['Confira os produtos disponíveis e as quantidades da sacola.', 'Check the available products and bag quantities.'],
  changed: ['Os preços ou a disponibilidade mudaram. Confira o resumo atualizado antes de continuar.', 'Prices or availability changed. Review the updated summary before continuing.'],
  closed: ['A loja recebe pedidos das 18h às 23h. Volte durante o funcionamento.', 'The store accepts orders from 6 pm to 11 pm. Return during opening hours.'],
  order: ['O pedido não foi criado. Confira os dados e tente novamente.', 'The order was not created. Check the details and try again.'],
  checkout: ['O pedido está salvo. Não foi possível abrir o PagBank; retome o pagamento sem criar outro pedido.', 'Your order is saved. Could not open PagBank; resume payment without creating another order.'],
  storage: ['Não foi possível salvar o retorno. Habilite o armazenamento do navegador antes de retomar o pagamento.', 'Could not save the return context. Enable browser storage before resuming payment.'],
  uncertain: ['A conexão não confirmou a criação. Para evitar duplicidade, não enviaremos outro pedido. Consulte o atendimento antes de tentar novamente.', 'The connection did not confirm order creation. To avoid duplicates, we will not submit another order. Contact support before trying again.'],
  totals: ['O servidor atualizou os valores. Confira o total confirmado abaixo antes de retomar o pagamento.', 'The server updated the amounts. Check the confirmed total below before resuming payment.'],
  legacyAccess: ['Esta compra antiga não possui comprovante de acesso neste navegador. Preserve o link de pagamento salvo e solicite verificação ao responsável. O número do pedido sozinho não autoriza consultas; nenhum pedido foi apagado.', 'This older purchase has no access proof in this browser. Keep its saved payment link and ask the operator to verify it. An order number alone does not authorize access; no order was deleted.'],
  lookup: ['Não foi possível consultar o pagamento. Consulte novamente; o retorno do PagBank não confirma a aprovação.', 'Could not check payment. Retry the lookup; returning from PagBank does not confirm approval.'],
  missing: ['Não encontramos o contexto deste pagamento neste navegador. Consulte o atendimento com a referência do pedido.', 'This browser has no saved payment context. Contact support with your order reference.'],
  unmatched: ['Os dados não correspondem ao pedido salvo. O pagamento e o WhatsApp foram bloqueados. Consulte o atendimento.', 'Details do not match the saved order. Payment and WhatsApp are blocked. Contact support.'],
};
const cepMessages: Record<Exclude<CepState, 'idle'>, [string, string]> = {
  loading: ['Consultando CEP…', 'Looking up ZIP code…'], invalid: ['Informe um CEP com 8 dígitos.', 'Enter an 8-digit ZIP code.'],
  'not-found': ['CEP não encontrado. Confira ou preencha o endereço manualmente.', 'ZIP code not found. Check it or enter the address manually.'],
  network: ['Falha na consulta. Tente novamente ou preencha manualmente.', 'Lookup failed. Retry or enter the address manually.'],
  timeout: ['A consulta demorou demais. Tente novamente ou preencha manualmente.', 'The lookup timed out. Retry or enter the address manually.'],
  incomplete: ['Endereço incompleto. Complete os campos que faltam.', 'Incomplete address. Fill in the missing fields.'],
  cancelled: ['Consulta cancelada. Você pode buscar o CEP novamente.', 'Lookup canceled. You can search for the ZIP code again.'],
  valid: ['Endereço encontrado. Confira os dados e informe o número.', 'Address found. Check the details and enter the building number.'],
};
const statusCopy: Record<PaymentStatusName, [string, string]> = {
  Pending: ['Pagamento pendente', 'Payment pending'], Approved: ['Pagamento aprovado', 'Payment approved'],
  Rejected: ['Pagamento recusado', 'Payment rejected'], Cancelled: ['Pagamento cancelado ou expirado', 'Payment canceled or expired'],
  Refunded: ['Pagamento reembolsado', 'Payment refunded'], PartiallyRefunded: ['Pagamento parcialmente reembolsado', 'Payment partially refunded'],
  ChargedBack: ['Pagamento contestado', 'Payment disputed'],
};

export function OrderDrawer({ isOpen, onClose, cart, onUpdateCart, initialMode = 'takeaway', currentLang = 'PT', onOpen, onBrowseMenu, storefrontCatalog, onTotalChange }: OrderDrawerProps) {
  const english = currentLang === 'EN';
  const t = (pt: string, en: string) => english ? en : pt;
  const flow = useCheckout({ isOpen, cart, onUpdateCart, onOpen, initialMode, storefrontCatalog });
  useEffect(() => { onTotalChange(flow.validCart ? flow.total : null); }, [flow.validCart, flow.total, onTotalChange]);
  const close = () => {
    if (flow.locked()) return;
    flow.dismissConfirmation();
    onClose();
  };
  const dialog = useModalFocus(isOpen, close);
  const region = useRef<HTMLDivElement>(null);
  const money = (value: number) => formatBRL(value, english);
  const disabled = flow.busy || flow.checking;
  const titles = [t('SACOLA', 'BAG'), t('IDENTIFICAÇÃO', 'YOUR DETAILS'), t('REVISÃO', 'REVIEW')];
  const steps = ['bag', 'details', 'review'] as const;
  const stepIndex = steps.indexOf(flow.step);
  useEffect(() => {
    if (!isOpen || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const resize = () => {
      region.current?.style.setProperty('--checkout-height', `${viewport.height}px`);
      region.current?.style.setProperty('--checkout-top', `${viewport.offsetTop}px`);
    };
    resize(); viewport.addEventListener('resize', resize); viewport.addEventListener('scroll', resize);
    return () => { viewport.removeEventListener('resize', resize); viewport.removeEventListener('scroll', resize); };
  }, [isOpen]);
  const changeQuantity = (id: string, delta: number) => {
    if (disabled) return;
    onUpdateCart(cart.flatMap(item => item.burger.id !== id ? [item] :
      item.quantity + delta <= 0 ? [] : [{ ...item, quantity: Math.min(99, item.quantity + delta) }]));
  };
  const field = (name: keyof CheckoutForm, label: string, options: InputHTMLAttributes<HTMLInputElement> = {}) => {
    const invalid = flow.errors[name];
    const message = name === 'phone' ? t('Informe um celular com DDD e nono dígito.', 'Enter a Brazilian mobile number with area code and ninth digit.') :
      name === 'email' ? t('Informe um e-mail válido com 10 a 60 caracteres.', 'Enter a valid email with 10–60 characters.') :
      name === 'cpf' ? t('Informe um CPF com dígitos verificadores válidos.', 'Enter a CPF with valid check digits.') :
      name === 'houseNumber' ? t('Informe apenas números, até 20 dígitos.', 'Use numbers only, up to 20 digits.') :
      name === 'zipCode' ? t('Informe um CEP com 8 dígitos e aguarde a consulta.', 'Enter an 8-digit ZIP code and wait for the lookup.') :
      name === 'customerName' ? t('Informe seu nome completo, com até 120 caracteres.', 'Enter your full name, up to 120 characters.') :
      t('Confira este campo e respeite o limite de caracteres.', 'Check this field and its character limit.');
    return <div className="checkout-field" key={name}>
      <label htmlFor={`checkout-${name}`}>{label}{options.required !== false && <span aria-hidden="true"> *</span>}</label>
      <input id={`checkout-${name}`} name={name} value={flow.form[name]} required disabled={disabled}
        {...options} aria-invalid={invalid || undefined} aria-describedby={invalid ? `checkout-${name}-error` : undefined}
        onChange={event => {
          const value = event.target.value;
          flow.update(name, name === 'phone' ? formatPhone(value) : name === 'cpf' ? formatCpf(value) : name === 'zipCode' ? formatCep(value) : value);
        }} />
      {invalid && <p id={`checkout-${name}-error`} className="checkout-field-error" role="alert">{message}</p>}
    </div>;
  };
  const totals = (values: { subtotal: number; discount?: number; deliveryFee: number; total: number }, paid = false) => <dl className="checkout-totals">
    <div><dt>{t('Subtotal dos itens', 'Items subtotal')}</dt><dd>{money(values.subtotal)}</dd></div>
    {(values.discount ?? 0) > 0 && <div><dt>{t('Desconto', 'Discount')}</dt><dd>−{money(values.discount ?? 0)}</dd></div>}
    <div><dt>{t('Taxa de entrega', 'Delivery fee')}</dt><dd>{values.deliveryFee ? money(values.deliveryFee) : t('Sem taxa', 'No fee')}</dd></div>
    <div className="checkout-total"><dt>{paid ? t('Total pago', 'Total paid') : 'Total'}</dt><dd>{money(values.total)}</dd></div>
  </dl>;
  if (!isOpen) return null;
  return createPortal(<div ref={region} className="checkout-layer">
    <div className="checkout-backdrop" onClick={close} aria-hidden="true" />
    <div ref={dialog} className="tbh-order-panel" role="dialog" aria-modal="true" aria-labelledby="checkout-title" aria-describedby="checkout-retention" tabIndex={-1}>
      <header className="checkout-header">
        <div className="checkout-heading-row">
          <img className="checkout-logo" src="/assets/branding/the-burger-house-logo-440.webp" width={440} height={440} alt="The Burger House" />
          <h2 id="checkout-title">{flow.paymentView ? t('SEU PAGAMENTO', 'YOUR PAYMENT') : t('SEU PEDIDO', 'YOUR ORDER')}</h2>
          <button type="button" className="checkout-icon" onClick={close} disabled={disabled} aria-label={t('Fechar pedido', 'Close order')}><X aria-hidden="true" /></button>
        </div>
        {!flow.paymentView && <ol className="checkout-progress" aria-label={t('Etapas do pedido', 'Order steps')}>
          {steps.map((step, index) => <li key={step} aria-current={flow.step === step ? 'step' : undefined}>
            <button type="button" disabled={disabled || index > stepIndex} onClick={() => flow.go(step)}><span>{index < stepIndex ? <CheckCircle2 aria-hidden="true" /> : index + 1}</span>{titles[index]}</button>
          </li>)}
        </ol>}
        <p className="checkout-sr-only" id="checkout-retention">{t('Seus dados são mantidos ao fechar o painel ou voltar uma etapa.', 'Closing the panel or going back preserves your details.')}</p>
      </header>
      <div className="checkout-body">
        {!flow.paymentView && flow.step !== 'bag' && <button type="button" className="checkout-link checkout-back" disabled={disabled}
          onClick={() => flow.go(flow.step === 'review' ? 'details' : 'bag')}><ArrowLeft aria-hidden="true" />
          {flow.step === 'review' ? t('VOLTAR À IDENTIFICAÇÃO', 'BACK TO YOUR DETAILS') : t('VOLTAR À SACOLA', 'BACK TO BAG')}</button>}
        {flow.notice && <p className="checkout-notice" role="alert">{t(...notices[flow.notice])}</p>}
        {!flow.paymentView && flow.step === 'bag' && <>
          <div className="checkout-section-heading"><h3 className="checkout-step-title" tabIndex={-1}>{t('SUA SACOLA', 'YOUR BAG')}</h3><span>{cart.reduce((sum, item) => sum + item.quantity, 0)} {t('itens', 'items')}</span></div>
          {!cart.length ? <div className="checkout-empty"><ShoppingBag aria-hidden="true" /><p>{t('Seu próximo favorito está no cardápio.', 'Your next favorite is on the menu.')}</p><button type="button" className="checkout-link" onClick={() => { close(); onBrowseMenu(); }}>{t('ESCOLHER UM BURGER', 'CHOOSE A BURGER')}<ArrowRight aria-hidden="true" /></button></div> : <>
            {flow.catalogState === 'loading' && <p role="status">{t('Conferindo preços e disponibilidade…', 'Checking prices and availability…')}</p>}
            {flow.catalogState === 'error' && <div className="checkout-catalog-error" role="alert"><p>{t('A conferência do catálogo está indisponível.', 'Catalogue verification is unavailable.')}</p><button type="button" className="checkout-link" onClick={() => void flow.refreshCatalog()}><RefreshCw aria-hidden="true" />{t('TENTAR NOVAMENTE', 'TRY AGAIN')}</button></div>}
            <ul className="checkout-items">{cart.map((item, index) => {
              const product = flow.product(item.burger.id), line = flow.items[index];
              const showPrice = flow.catalogState === 'ready' && product?.available && product.code;
              const name = english ? product?.englishName || englishMenuCopy[item.burger.id]?.name || item.burger.name : product?.name || item.burger.name;
              return <li key={item.burger.id} className="checkout-item" data-cart-product={item.burger.id}>
                {(item.burger.image || product?.uploadedImage) && <img className="checkout-product-image" {...productImage(item.burger.image, '108px', product?.uploadedImage)} alt="" width={108} height={100} />}
                <div className="checkout-item-copy"><h4>{name}</h4>{showPrice && <p>{money(line.price)} {t('por unidade', 'each')}</p>}
                  {flow.catalogState === 'ready' && !product?.available && <p className="checkout-field-error">{t('Indisponível. Remova para continuar.', 'Unavailable. Remove to continue.')}</p>}
                  {item.extras.map(extra => <p key={extra.id}>{extra.quantity ?? 1}× {extra.name} · {money(extra.price)}</p>)}
                  {item.customNotes && <p>{item.customNotes}</p>}
                  <div className="checkout-quantity"><button type="button" className="checkout-icon" aria-label={t(`Diminuir quantidade de ${name}`, `Decrease ${name} quantity`)} onClick={() => changeQuantity(item.burger.id, -1)}><Minus aria-hidden="true" /></button><output aria-label={t('Quantidade', 'Quantity')}>{item.quantity}</output><button type="button" className="checkout-icon" disabled={item.quantity >= 99} aria-label={t(`Aumentar quantidade de ${name}`, `Increase ${name} quantity`)} onClick={() => changeQuantity(item.burger.id, 1)}><Plus aria-hidden="true" /></button></div>
                </div><div className="checkout-item-actions">{showPrice && <strong>{money(line.price * item.quantity)}</strong>}<button type="button" className="checkout-icon" aria-label={t(`Remover ${name}`, `Remove ${name}`)} onClick={() => onUpdateCart(cart.filter((_, current) => current !== index))}><Trash2 aria-hidden="true" /></button></div>
              </li>;
            })}</ul>
            {cart.map((item, index) => {
              const product = flow.product(item.burger.id);
              const category = product?.category === 'Burgers' ? 'menu' : product?.category === 'Acompanhamentos' ? 'sides' : 'drinks';
              const options = flow.extrasCatalog.filter(extra => extra.productCategory === category);
              return <details className="checkout-extras" key={item.burger.id}><summary>{t('Adicionais e observações', 'Extras and notes')} · {product?.name ?? item.burger.name}</summary>
                {options.length === 0 && <p>{t('Sem adicionais disponíveis para este produto.', 'No extras available for this product.')}</p>}
                {options.map(extra => {
                  const selected = item.extras.find(option => option.id === extra.code);
                  return <label key={extra.code} className="checkout-extra-option"><span>{extra.name} · {money(extra.price)}</span>
                    <select aria-label={t(`Quantidade de ${extra.name} para ${item.burger.name}`, `Quantity of ${extra.name} for ${item.burger.name}`)}
                      value={selected?.quantity ?? (selected ? 1 : 0)} disabled={disabled}
                      onChange={event => {
                        const quantity = Number(event.target.value);
                        onUpdateCart(cart.map((line, current) => current !== index ? line : {
                          ...line, extras: [...line.extras.filter(option => option.id !== extra.code),
                            ...(quantity ? [{ id: extra.code, name: extra.name, price: extra.price, quantity }] : [])],
                        }));
                      }}>
                      {Array.from({ length: extra.maximumQuantity + 1 }, (_, quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}
                    </select>
                  </label>;
                })}
                <label>{t('Observações para este produto', 'Notes for this product')}<input maxLength={280} value={item.customNotes ?? ''} disabled={disabled}
                  onChange={event => onUpdateCart(cart.map((line, current) => current === index ? { ...line, customNotes: event.target.value } : line))}
                  placeholder={t('Ex.: sem cebola, molho separado', 'E.g. no onion, sauce on the side')} /></label>
              </details>;
            })}
            <div className="checkout-coupon"><label htmlFor="checkout-coupon">{t('Cupom de desconto', 'Discount code')}</label>
              <div><input id="checkout-coupon" value={flow.couponDraft} maxLength={40} disabled={disabled}
                onChange={event => flow.setCouponDraft(event.target.value)} />
                <button type="button" className="checkout-secondary" onClick={flow.applyCoupon} disabled={disabled || !flow.couponDraft.trim() || flow.pricingBusy}>{t('Aplicar', 'Apply')}</button>
                {flow.couponCode && <button type="button" className="checkout-link" onClick={flow.removeCoupon} disabled={disabled}>{t('Remover', 'Remove')}</button>}</div>
              {flow.pricingBusy && <p role="status">{t('Validando valores…', 'Validating amounts…')}</p>}
              {flow.pricingMessage && <p role="alert">{flow.pricingMessage}</p>}
              {flow.couponCode && flow.discount > 0 && <p role="status">{t('Cupom válido', 'Valid discount code')} · −{money(flow.discount)}</p>}
            </div>
            {totals({ subtotal: flow.itemSubtotal, discount: flow.discount, deliveryFee: flow.deliveryFee, total: flow.total })}
          </>}
        </>}
        {!flow.paymentView && flow.step === 'details' && <form id="checkout-identification" noValidate onSubmit={event => { event.preventDefault(); flow.go('review'); }}>
          <h3 className="checkout-step-title" tabIndex={-1}>{t('COMO VAMOS PREPARAR SEU PEDIDO?', 'HOW SHOULD WE PREPARE YOUR ORDER?')}</h3>
          <fieldset className="checkout-mode"><legend className="checkout-sr-only">{t('Modalidade do pedido', 'Order fulfillment')}</legend>
            {(['pickup', 'delivery'] as const).map(mode => <label key={mode}><input type="radio" name="fulfillment" value={mode} checked={flow.form.fulfillment === mode} disabled={disabled} onChange={() => flow.update('fulfillment', mode)} />{mode === 'pickup' ? <Store aria-hidden="true" /> : <Truck aria-hidden="true" />}<span>{mode === 'pickup' ? t('RETIRADA NO LOCAL', 'STORE PICKUP') : t('ENTREGA', 'DELIVERY')}</span></label>)}
          </fieldset>
          <h4 className="checkout-group-title">{t('SEUS DADOS', 'YOUR DETAILS')}</h4><p className="checkout-hint">{t('Todos os campos com * são obrigatórios.', 'All fields marked * are required.')}</p>
          <div className="checkout-form-grid">
            {field('customerName', t('Nome completo', 'Full name'), { autoComplete: 'name', maxLength: 120 })}
            {field('phone', t('Celular com DDD', 'Mobile with area code'), { type: 'tel', inputMode: 'tel', autoComplete: 'tel-national', maxLength: 15, placeholder: '(11) 99999-0000' })}
            {field('cpf', 'CPF', { inputMode: 'numeric', autoComplete: 'off', maxLength: 14, placeholder: '000.000.000-00' })}
            {field('email', 'E-mail', { type: 'email', inputMode: 'email', autoComplete: 'email', minLength: 10, maxLength: 60, autoCapitalize: 'none', spellCheck: false })}
          </div>
          <p className="checkout-privacy">{t('Usamos seus dados para processar o pedido, pagamento e entrega/retirada. O PagBank recebe os dados necessários ao pagamento.', 'We use your details to process your order, payment and delivery/pickup. PagBank receives the information needed for payment.')} <a href="/privacy.html" target="_blank" rel="noopener noreferrer">{t('Política de Privacidade (nova aba)', 'Privacy policy (Portuguese, new tab)')}</a></p>
          {flow.form.fulfillment === 'pickup' ? <section className="checkout-pickup"><MapPin aria-hidden="true" /><div><h4>{t('RETIRE NO BALCÃO', 'COLLECT AT THE COUNTER')}</h4><p>{STORE_CONFIG.pickupAddress}</p><p>{t('Sem taxa de entrega.', 'No delivery fee.')}</p></div></section> : <>
            <h4 className="checkout-group-title">{t('ENDEREÇO DE ENTREGA', 'DELIVERY ADDRESS')}</h4>
            <div className="checkout-cep-row">{field('zipCode', 'CEP', { inputMode: 'numeric', autoComplete: 'postal-code', maxLength: 9, placeholder: '00000-000', onBlur: () => { if (flow.form.zipCode) void flow.searchCep(); } })}<button type="button" className="checkout-secondary" disabled={flow.cepState === 'loading' || disabled} onClick={() => void flow.searchCep()}>{t('BUSCAR CEP', 'FIND ADDRESS')}</button></div>
            {flow.cepState !== 'idle' && <p className="checkout-cep-message" role="status">{t(...cepMessages[flow.cepState])}</p>}
            <p className="checkout-hint">{t('Confira os dados do ViaCEP. Você pode completar ou corrigir o endereço.', 'Check the ViaCEP details. You can complete or correct the address.')}</p>
            <div className="checkout-form-grid checkout-address">
              {field('street', t('Rua', 'Street'), { autoComplete: 'address-line1', maxLength: 200 })}
              {field('houseNumber', t('Número', 'Building number'), { inputMode: 'numeric', maxLength: 20, pattern: '[0-9]+' })}
              {field('neighborhood', t('Bairro', 'Neighborhood'), { autoComplete: 'address-level3', maxLength: 120 })}
              {field('city', t('Cidade', 'City'), { autoComplete: 'address-level2', maxLength: 120 })}
              {field('complement', t('Complemento (opcional)', 'Additional address details (optional)'), { autoComplete: 'address-line2', maxLength: 200, required: false })}
            </div>
          </>}
        </form>}
        {!flow.paymentView && flow.step === 'review' && <>
          <h3 className="checkout-step-title" tabIndex={-1}>{t('REVISE SEU PEDIDO', 'REVIEW YOUR ORDER')}</h3><p className="checkout-intro">{t('Confira tudo antes de ir para o pagamento.', 'Check everything before continuing to payment.')}</p>
          <ul className="checkout-review-items">{flow.items.map((item, index) => {
            const product = flow.product(item.id);
            const name = english ? product?.englishName || englishMenuCopy[item.id]?.name || item.name : item.name;
            return <li key={item.id}>{(cart[index].burger.image || product?.uploadedImage) && <img {...productImage(cart[index].burger.image, '64px', product?.uploadedImage)} alt="" width={64} height={64} />}
              <div><h4>{name}</h4><p>{item.quantity} × {money(item.price)}</p>{cart[index].extras.map(extra => <p key={extra.id}>{extra.quantity ?? 1}× {extra.name} · {money(extra.price)}</p>)}{cart[index].customNotes && <p>{cart[index].customNotes}</p>}</div>
              <strong>{money(item.quantity * item.price)}</strong></li>;
          })}</ul>
          <section className="checkout-review-group"><h4>{t('IDENTIFICAÇÃO', 'YOUR DETAILS')}</h4><p>{flow.form.customerName}</p><p>{flow.form.phone.slice(0, 4)} •••••-{flow.form.phone.slice(-4)}</p></section>
          <section className="checkout-review-group"><h4>{flow.form.fulfillment === 'pickup' ? t('RETIRADA NO BALCÃO', 'COUNTER PICKUP') : t('ENTREGA', 'DELIVERY')}</h4><p>{flow.form.fulfillment === 'pickup' ? STORE_CONFIG.pickupAddress : `${flow.form.street}, ${flow.form.houseNumber} — ${flow.form.neighborhood}, ${flow.form.city} · ${flow.form.zipCode}${flow.form.complement ? ` · ${flow.form.complement}` : ''}`}</p></section>
          <div className="checkout-field checkout-notes"><label htmlFor="checkout-observation">{t('Observações do pedido (opcional)', 'Order notes (optional)')}</label><textarea id="checkout-observation" value={flow.form.observation} maxLength={280} rows={3} aria-describedby="checkout-observation-hint" onChange={event => flow.update('observation', event.target.value)} /><p id="checkout-observation-hint">{t('Informe só o necessário para o atendimento. Evite dados pessoais.', 'Include only what is needed to prepare your order. Avoid personal data.')} <span>{flow.form.observation.length}/280</span></p></div>
          {totals({ subtotal: flow.itemSubtotal, discount: flow.discount, deliveryFee: flow.deliveryFee, total: flow.total })}
          <p className="checkout-hint"><Clock3 aria-hidden="true" />{t('Pedidos das 18h às 23h. Valores conferidos novamente antes do pagamento.', 'Orders from 6 pm to 11 pm. Amounts are checked again before payment.')}</p>
        </>}
        {flow.paymentView && <section className="checkout-payment">
          <h3 className="checkout-step-title" tabIndex={-1}>{flow.session ? t(`PEDIDO #${flow.session.orderId}`, `ORDER #${flow.session.orderId}`) : t('RETORNO DO PAGAMENTO', 'PAYMENT RETURN')}</h3>
          {flow.session && <>
            <div className="checkout-payment-state" role="status" aria-live="polite">{flow.status === 'Approved' ? <CheckCircle2 aria-hidden="true" /> : <Clock3 aria-hidden="true" />}<h4>{flow.status === 'Approved' ? t(...statusCopy.Approved) : flow.checking ? t('Consultando pagamento…', 'Checking payment…') : flow.status === 'Cancelled' && !flow.session.paymentId ? t('Pedido cancelado', 'Order canceled') : flow.status ? t(...statusCopy[flow.status]) : flow.session.paymentId ? t('Confirmação ainda não consultada', 'Confirmation not checked yet') : t('Pedido registrado', 'Order registered')}</h4></div>
            <p>{flow.status === 'Approved'
              ? t('Pagamento confirmado. Seu pedido foi recebido pela hamburgueria.', 'Payment confirmed. The restaurant has received your order.')
              : flow.status === 'Rejected' ? t('O pagamento foi recusado. Você pode iniciar outro pedido.', 'Payment was rejected. You can place a new order.')
              : flow.status === 'Cancelled' ? t('Este pagamento não pode ser retomado. Você pode iniciar outro pedido.', 'This payment cannot be resumed. You can place a new order.')
              : t('Seu pedido está registrado. Conclua o pagamento no PagBank ou consulte a confirmação.', 'Your order is registered. Complete payment on PagBank or check its status.')}</p>
            <p className="checkout-intro">{flow.session.fulfillment === 'pickup' ? t('RETIRADA NO LOCAL', 'STORE PICKUP') : t('ENTREGA', 'DELIVERY')}</p>
            <ul className="checkout-receipt">{flow.session.items.map(item => <li key={item.code}><span>{item.quantity}× {item.name}</span>{flow.session?.lines?.find(line => line.code === item.code) && <strong>{money(flow.session.lines.find(line => line.code === item.code)!.price * item.quantity)}</strong>}</li>)}</ul>
            {totals(flow.session, flow.status === 'Approved')}
            {flow.session.address && <p className="checkout-receipt-address"><MapPin aria-hidden="true" />{flow.session.address}</p>}
            {flow.session.observation && <p>{t('Observações', 'Notes')}: {flow.session.observation}</p>}
            {flow.session.paymentId > 0 && flow.status !== 'Approved' && <button type="button" className="checkout-secondary checkout-check-status" disabled={disabled} onClick={() => void flow.checkPayment()}><RefreshCw aria-hidden="true" />{t('CONSULTAR PAGAMENTO', 'CHECK PAYMENT')}</button>}
            {flow.status === 'Approved' && flow.session.lines && flow.session.address && <button type="button" className="checkout-secondary checkout-check-status" disabled={disabled || !publicWhatsAppNumber()} onClick={() => void flow.whatsapp(english)}>{publicWhatsAppNumber() ? t('ENVIAR RESUMO PELO WHATSAPP', 'SHARE SUMMARY ON WHATSAPP') : t('CONTATO NÃO CONFIGURADO', 'CONTACT NOT CONFIGURED')}</button>}
          </>}
        </section>}
      </div>
      <footer className="checkout-footer">
        {!flow.paymentView ? <>
          <div className="checkout-footer-total"><span>{flow.step === 'bag' && !flow.discount ? 'Subtotal' : 'Total'}</span><strong>{!cart.length || flow.validCart ? money(flow.step === 'bag' && !flow.discount ? flow.itemSubtotal : flow.total) : '—'}</strong></div>
          {flow.step === 'details' ? (
            <button key="review-order" type="submit" form="checkout-identification" className="tbh-button tbh-button--primary checkout-primary" disabled={disabled || !flow.validCart || flow.notice === 'uncertain'}>
              {t('REVISAR PEDIDO', 'REVIEW ORDER')}<ArrowRight aria-hidden="true" />
            </button>
          ) : (
            <button key={flow.step} type="button" className="tbh-button tbh-button--primary checkout-primary" disabled={disabled || !flow.validCart || flow.notice === 'uncertain'} onClick={() => flow.step === 'bag' ? flow.go('details') : void flow.submit()}>
              {flow.busy ? t('PREPARANDO…', 'PREPARING…') : flow.step === 'review' ? t('IR PARA PAGAMENTO', 'CONTINUE TO PAYMENT') : t('CONTINUAR', 'CONTINUE')}<ArrowRight aria-hidden="true" />
            </button>
          )}
          {flow.step === 'review' && <p>{t('Pix ou cartão de crédito no checkout seguro do PagBank.', 'Pix or credit card in the secure PagBank checkout.')}</p>}
        </> : flow.session && <>
          {flow.status && flow.status !== 'Pending' ? <button type="button" className="tbh-button tbh-button--primary checkout-primary" disabled={disabled} onClick={() => { flow.newOrder(); onClose(); onBrowseMenu(); }}>{t('FAZER NOVO PEDIDO', 'PLACE A NEW ORDER')}<ArrowRight aria-hidden="true" /></button> :
            ((!flow.session.paymentId && !flow.status) || flow.status === 'Pending') && flow.notice !== 'unmatched' && <button type="button" className="tbh-button tbh-button--primary checkout-primary" disabled={disabled} onClick={() => void flow.resumePayment()}>{flow.busy ? t('PREPARANDO…', 'PREPARING…') : t('RETOMAR PAGAMENTO', 'RESUME PAYMENT')}<ArrowRight aria-hidden="true" /></button>}
          <p>{flow.status && flow.status !== 'Pending'
            ? t('Ao fechar, a confirmação é encerrada sem apagar o pedido.', 'Closing this confirmation returns you to the store without deleting your order.')
            : t('O contexto do pedido em andamento é mantido neste navegador.', 'Your in-progress order stays available in this browser.')}</p>
        </>}
      </footer>
    </div>
  </div>, document.body);
}
