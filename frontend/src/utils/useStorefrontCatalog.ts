import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCatalog, type CatalogProduct } from '../../../shared/storefront/features/catalog/catalog';
import { catalogProduct } from '../checkout/model';
import { formatBRL } from './menu';

type CatalogState = 'loading' | 'ready' | 'error';

export function useStorefrontCatalog() {
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [catalogState, setCatalogState] = useState<CatalogState>('loading');
  const request = useRef<AbortController | null>(null);

  const publishCatalog = useCallback((products: CatalogProduct[]) => {
    request.current?.abort();
    request.current = null;
    setCatalog(products);
    setCatalogState('ready');
  }, []);

  const refreshCatalog = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setCatalogState('loading');
    try {
      const products = await fetchCatalog(controller.signal);
      if (!controller.signal.aborted) publishCatalog(products);
    } catch {
      if (!controller.signal.aborted) setCatalogState('error');
    }
  }, [publishCatalog]);

  useEffect(() => {
    void refreshCatalog();
    return () => request.current?.abort();
  }, [refreshCatalog]);

  return { catalog, catalogState, refreshCatalog, publishCatalog };
}

export type StorefrontCatalog = ReturnType<typeof useStorefrontCatalog>;

export function storefrontOffer({ catalog, catalogState }: StorefrontCatalog, id: string, english: boolean) {
  const product = catalogState === 'ready' ? catalogProduct(catalog, id) : undefined;
  if (product?.available && product.code) return { available: true, price: formatBRL(product.price, english), product };
  const price = catalogState === 'loading' ? (english ? 'Checking price…' : 'Conferindo preço…')
    : catalogState === 'error' ? (english ? 'Price unavailable' : 'Preço indisponível')
    : (english ? 'Unavailable' : 'Indisponível');
  return { available: false, price, product };
}

export type StorefrontOffer = ReturnType<typeof storefrontOffer>;
