import React, { useEffect, useRef, useState } from 'react';
import { UtensilsCrossed, Plus, Search, Edit2, AlertCircle } from 'lucide-react';
import { MenuItem } from '../types';
import { Modal } from '../components/common/Modal';
import { CurrencyValue } from '../components/common/CurrencyValue';
import { translateProduct, validateProductImage } from '../services/ownerProducts';
import { formatOwnerPercentage } from '../services/ownerPresentation';

interface MenuPageProps {
  menu: MenuItem[];
  onToggleAvailability: (itemId: string) => Promise<void>;
  onSaveMenuItem: (item: MenuItem) => Promise<void>;
  onUploadImage?: (id: string, file: File) => Promise<void>;
  onDeleteImage?: (id: string) => Promise<void>;
  onNotifyToast: (
    title: string,
    description?: string,
    variant?: 'info' | 'success' | 'warning'
  ) => void;
}

const CATEGORY_LABELS: Record<MenuItem['category'], string> = {
  burgers: 'Hambúrgueres',
  sides: 'Acompanhamentos',
  drinks: 'Bebidas',
  desserts: 'Sobremesas',
};

function ProductPhoto({ src, name }: { src: string; name: string }) {
  const [unavailable, setUnavailable] = useState(false);
  return unavailable ? <p className="owner-muted text-xs">Imagem indisponível</p> :
    <img className="owner-product-photo" src={src} alt={name} loading="lazy" decoding="async" onError={() => setUnavailable(true)} />;
}

export const MenuPage: React.FC<MenuPageProps> = ({
  menu,
  onToggleAvailability,
  onSaveMenuItem,
  onUploadImage,
  onDeleteImage,
  onNotifyToast,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'paused'>('all');
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MenuItem['category']>('burgers');
  const [price, setPrice] = useState<number>(0);
  const [cost, setCost] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [orderIndex, setOrderIndex] = useState<number>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [englishName, setEnglishName] = useState('');
  const [englishDescription, setEnglishDescription] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const imageWrite = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [listMode, setListMode] = useState(false);
  const [availabilityItem, setAvailabilityItem] = useState<MenuItem | null>(null);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const pausedCount = menu.filter(item => !item.available).length;
  const currentProduct = editingItem && menu.find(item => item.id === editingItem.id);

  useEffect(() => {
    if (!imageFile) { setImagePreview(null); return; }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const closeEditor = () => {
    if (imageWrite.current || formBusy) return;
    setIsModalOpen(false);
    setImageFile(null);
    setImageError('');
  };

  async function changeImage(remove: boolean) {
    if (!editingItem || imageWrite.current || formBusy) return;
    imageWrite.current = true;
    setImageBusy(true);
    setImageError('');
    try {
      if (remove && onDeleteImage) await onDeleteImage(editingItem.id);
      else if (imageFile && onUploadImage) await onUploadImage(editingItem.id, imageFile);
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
      onNotifyToast(remove ? 'Imagem removida no servidor' : 'Imagem salva no servidor');
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Não foi possível atualizar a imagem.');
    } finally {
      imageWrite.current = false;
      setImageBusy(false);
    }
  }

  const filteredItems = [...menu]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .filter((item) => {
      const matchesCategory =
        activeCategory === 'all' || item.category === activeCategory;
      const matchesAvail =
        availabilityFilter === 'all' ||
        (availabilityFilter === 'available' ? item.available : !item.available);
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q);
      return matchesCategory && matchesAvail && matchesSearch;
    });

  const handleOpenNew = () => {
    setEditingItem(null);
    setName('');
    setCategory('burgers');
    setPrice(0);
    setCost(null);
    setDescription('');
    setEnglishName('');
    setEnglishDescription('');
    setOrderIndex(menu.length + 1);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setCategory(item.category);
    setPrice(item.price);
    setCost(item.costKnown === false ? null : item.cost);
    setDescription(item.description);
    setEnglishName(item.englishName ?? '');
    setEnglishDescription(item.englishDescription ?? '');
    setOrderIndex(item.orderIndex);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formBusy || imageWrite.current) return;
    if (name.trim().length < 2) {
      setFormError('Informe um nome válido para o item do cardápio.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('O preço de venda deve ser maior que zero.');
      return;
    }
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      setFormError('O custo CMV não pode ser negativo.');
      return;
    }

    setFormBusy(true);
    setFormError(null);
    try { await onSaveMenuItem({
      id: editingItem ? editingItem.id : `menu-${Date.now()}`,
      name: name.trim(),
      category,
      price: Number(price),
      cost: cost ?? 0,
      costKnown: cost !== null,
      description: description.trim(),
      englishName: englishName.trim(),
      englishDescription: englishDescription.trim(),
      available: editingItem ? editingItem.available : true,
      prepTimeMinutes: editingItem?.prepTimeMinutes ?? 0,
      orderIndex,
    }); } catch (error) { setFormError(error instanceof Error ? error.message : 'Falha ao salvar.'); return; }
    finally { setFormBusy(false); }

    setIsModalOpen(false);
    onNotifyToast(
      editingItem ? 'Produto atualizado' : 'Produto cadastrado',
      `${name.trim()} confirmado pelo servidor.`,
      'success'
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="owner-panel rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="owner-module-icon">
            <UtensilsCrossed size={21} aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-['Anton'] text-2xl uppercase tracking-wide text-slate-900 dark:text-white">
              Gestão de Cardápio & Itens
            </h2>
            <p className="text-xs font-['Barlow_Condensed'] uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Controle de preços, margens, ordem de exibição e disponibilidade
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenNew}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl owner-button owner-primary font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-xs transition-all"
        >
          <Plus size={16} />
          <span>Cadastrar Novo Produto</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="owner-panel rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400"
            />
            <input
              type="search"
              aria-label="Buscar itens do cardápio"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome do lanche ou ingrediente..."
              className="owner-input w-full pl-9 pr-3 py-2 rounded-xl text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Todos os Itens' },
              { id: 'burgers', label: 'Hambúrgueres' },
              { id: 'sides', label: 'Acompanhamentos' },
              { id: 'drinks', label: 'Bebidas & Cervejas' },
              { id: 'desserts', label: 'Sobremesas' },
            ].filter(cat => cat.id === 'all' || menu.some(item => item.category === cat.id)).map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-['Barlow_Condensed'] font-semibold uppercase tracking-wider transition-all whitespace-nowrap ${
                  activeCategory === cat.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-black/5 dark:border-white/15'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-black/5 dark:border-white/10">
          <span className="text-[11px] font-['Barlow_Condensed'] uppercase tracking-wider font-semibold text-slate-600 dark:text-slate-300 mr-1">
            Disponibilidade:
          </span>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'available', label: 'Disponíveis' },
            { id: 'paused', label: `Pausados (${pausedCount})` },
          ].map((av) => (
            <button
              key={av.id}
              type="button"
              onClick={() => setAvailabilityFilter(av.id as 'all' | 'available' | 'paused')}
              aria-pressed={availabilityFilter === av.id}
              className="owner-button"
            >
              {av.label}
            </button>
          ))}
          <label className="owner-field ml-auto"><span>Visualização</span><select value={listMode ? 'list' : 'grid'} onChange={event => setListMode(event.target.value === 'list')}>
            <option value="grid">Grade</option><option value="list">Lista</option>
          </select></label>
        </div>
      </div>

      {/* Menu Grid */}
      {filteredItems.length === 0 ? (
        <div className="py-16 text-center text-slate-600 dark:text-slate-300 owner-panel rounded-3xl">
          <UtensilsCrossed size={40} className="mx-auto mb-3 opacity-35" />
          <p className="font-['Barlow_Condensed'] text-base uppercase tracking-wider">
            Nenhum item encontrado no cardápio para estes filtros
          </p>
        </div>
      ) : (
        <div className={listMode ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'}>
          {filteredItems.map((item) => {
            const margin =
              item.price > 0 ? ((item.price - item.cost) / item.price) * 100 : 0;

            return (
              <div
                key={item.id}
                className={`owner-panel p-4 flex justify-between gap-2 ${listMode ? 'flex-wrap items-center' : 'flex-col'}`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.badge && (
                        <span className="px-2 py-0.5 rounded-md bg-[#FFDC32] text-slate-900 text-[10px] font-['Barlow_Condensed'] font-bold uppercase tracking-wider">
                          {item.badge}
                        </span>
                      )}
                      <span className="text-[10px] font-['Barlow_Condensed'] uppercase tracking-wider text-slate-600 dark:text-slate-300 font-semibold">
                        #{item.orderIndex} • {CATEGORY_LABELS[item.category]}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      aria-label={`Editar ${item.name}`}
                      className="owner-icon-button"
                      title="Editar dados do produto"
                    >
                      <Edit2 size={13} />
                    </button>
                  </div>

                  {item.imageUrl && <ProductPhoto key={item.imageUrl} src={item.imageUrl} name={item.name} />}
                  <h3 className="font-['Anton'] text-xl uppercase tracking-wide text-slate-900 dark:text-white mb-1.5">
                    {item.name}
                  </h3>
                  {item.description && <p className="owner-muted text-xs line-clamp-1 mb-2">{item.description}</p>}

                  {/* Technical stats */}
                  {item.costKnown !== false && <div className="flex flex-wrap gap-3 text-xs mb-2">
                    <div>
                      <span className="text-slate-600 dark:text-slate-300 block font-['Barlow_Condensed'] uppercase">
                        Custo CMV
                      </span>
                      <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                        <CurrencyValue value={item.cost} size="xs" />
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-600 dark:text-slate-300 block font-['Barlow_Condensed'] uppercase">
                        Margem
                      </span>
                      <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatOwnerPercentage(margin)}
                      </span>
                    </div>
                  </div>}
                </div>

                {/* Price and Availability Toggle */}
                <div className="pt-3 border-t border-black/10 dark:border-white/10 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-['Barlow_Condensed'] uppercase text-slate-600 dark:text-slate-300 block">
                      Preço de Venda
                    </span>
                    <span className="font-['Anton'] tracking-wider">
                      <CurrencyValue value={item.price} size="lg" />
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                      {item.available ? 'Disponível' : 'Pausado'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.available}
                      aria-label={`Alternar disponibilidade de ${item.name}`}
                      onClick={() => { setAvailabilityError(''); setAvailabilityItem(item); }}
                      className="owner-button"
                    >
                      {item.available ? 'Pausar' : 'Reativar'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {availabilityItem && <Modal isOpen onClose={() => { if (!availabilityBusy) setAvailabilityItem(null); }}
        title={availabilityItem.available ? 'Pausar produto' : 'Reativar produto'} titleId="product-availability-title">
        <p className="mb-3">{availabilityItem.name} {availabilityItem.available ? 'sairá dos itens disponíveis no cardápio.' : 'voltará ao cardápio.'}</p>
        {availabilityError && <p role="alert" className="mb-2">{availabilityError}</p>}
        <button className="owner-button owner-primary" disabled={availabilityBusy} onClick={async () => {
          setAvailabilityBusy(true);
          try { await onToggleAvailability(availabilityItem.id); setAvailabilityItem(null); }
          catch (cause) { setAvailabilityError(cause instanceof Error ? cause.message : 'Não foi possível alterar o produto.'); }
          finally { setAvailabilityBusy(false); }
        }}>{availabilityBusy ? 'Atualizando…' : 'Confirmar disponibilidade'}</button>
      </Modal>}
      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeEditor}
        title={
          editingItem ? 'Editar Produto do Cardápio' : 'Cadastrar Novo Produto'
        }
        subtitle="Edição do catálogo no servidor"
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          {editingItem && <fieldset className="owner-panel p-3 space-y-2" disabled={imageBusy || formBusy}><legend>Imagem do produto</legend>
            {imagePreview
              ? <ProductPhoto key={imagePreview} src={imagePreview} name="Prévia da nova imagem" />
              : currentProduct?.imageUrl ? <ProductPhoto key={currentProduct.imageUrl} src={currentProduct.imageUrl} name="Imagem atual do produto" />
                : <p className="owner-muted">Sem imagem cadastrada.</p>}
            <label className="owner-field"><span>Selecionar JPG, PNG ou WebP (até 5 MB)</span><input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
              const file = event.currentTarget.files?.[0];
              setImageError('');
              try { if (file) validateProductImage(file); setImageFile(file ?? null); }
              catch (error) {
                setImageFile(null);
                event.currentTarget.value = '';
                setImageError(error instanceof Error ? error.message : 'Imagem inválida.');
              }
            }} /></label>
            <div className="flex flex-wrap gap-2">
              <button className="owner-button owner-primary" type="button" disabled={!imageFile || !onUploadImage} onClick={() => void changeImage(false)}>Salvar imagem</button>
              {currentProduct?.uploadedImage && onDeleteImage && <button type="button" className="owner-button owner-button-critical" onClick={() => {
                if (window.confirm('Remover a imagem deste produto?')) void changeImage(true);
              }}>Remover imagem</button>}
            </div>
            {imageBusy && <p role="status">Atualizando imagem…</p>}
            {imageError && <p role="alert">{imageError}</p>}
          </fieldset>}
          {formError && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-medium flex items-center gap-2"
            >
              <AlertCircle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div>
            <label htmlFor="owner-product-name" className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
              Nome do Item *
            </label>
            <input
              id="owner-product-name"
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Double Cheddar Trufado"
              className="owner-input w-full p-2.5 rounded-xl font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="owner-product-category" className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
                Categoria
              </label>
              <select
                id="owner-product-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as MenuItem['category'])
                }
                className="owner-input w-full p-2.5 rounded-xl"
              >
                <option value="burgers">Hambúrgueres</option>
                <option value="sides">Acompanhamentos</option>
                <option value="drinks">Bebidas & Cervejas</option>
              </select>
            </div>
            <div>
              <label htmlFor="owner-product-position" className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
                Ordem Exibição
              </label>
              <input
                id="owner-product-position"
                type="number"
                min="0"
                value={orderIndex}
                onChange={(e) => setOrderIndex(Number(e.target.value))}
                className="owner-input w-full p-2.5 rounded-xl font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="owner-product-price" className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
                Preço Venda (R$) *
              </label>
              <input
                id="owner-product-price"
                required
                type="number"
                step="0.01"
                min="0.01"
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="owner-input w-full p-2.5 rounded-xl font-mono"
              />
            </div>
            <div>
              <label htmlFor="owner-product-cost" className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
                Custo CMV (R$)
              </label>
              <input
                id="owner-product-cost"
                type="number"
                step="0.01"
                min="0"
                value={cost ?? ''}
                onChange={(e) => setCost(e.target.value === '' ? null : Number(e.target.value))}
                className="owner-input w-full p-2.5 rounded-xl font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="owner-product-description" className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
              Descrição do produto
            </label>
            <textarea
              id="owner-product-description"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Pão artesanal tostado, blend 180g, queijo cheddar inglês..."
              className="owner-input w-full p-2.5 rounded-xl"
            />
          </div>

          <fieldset className="space-y-2" disabled={formBusy}>
            <legend className="font-semibold">Tradução do produto</legend>
            <label className="block">Nome em inglês
              <input className="owner-input block w-full p-2.5 rounded-xl" maxLength={150} value={englishName} onChange={event => setEnglishName(event.target.value)} />
            </label>
            <label className="block">Descrição em inglês
              <textarea className="owner-input block w-full p-2.5 rounded-xl" maxLength={500} value={englishDescription} onChange={event => setEnglishDescription(event.target.value)} />
            </label>
            <button type="button" className="owner-input px-3 py-2 rounded-xl" disabled={!name.trim() || !description.trim()} onClick={async () => {
              setFormBusy(true);
              setFormError(null);
              try {
                const translation = await translateProduct(name.trim(), description.trim());
                setEnglishName(translation.englishName);
                setEnglishDescription(translation.englishDescription);
              } catch (error) {
                setFormError(error instanceof Error ? error.message : 'Tradução indisponível.');
              } finally { setFormBusy(false); }
            }}>Traduzir para inglês</button>
          </fieldset>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-['Barlow_Condensed'] uppercase font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={formBusy}
              className="flex-1 py-2.5 rounded-xl owner-button owner-primary font-['Barlow_Condensed'] uppercase font-semibold"
            >
              Salvar Item
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
