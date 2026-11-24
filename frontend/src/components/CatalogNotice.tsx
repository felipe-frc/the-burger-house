import type { StorefrontCatalog } from '../utils/useStorefrontCatalog';

export function CatalogNotice({ storefrontCatalog, english }: { storefrontCatalog: StorefrontCatalog; english: boolean }) {
  if (storefrontCatalog.catalogState !== 'error') return null;
  return <div className="tbh-catalog-notice" role="alert">
    <span>{english ? 'Prices and availability could not be verified.' : 'Não foi possível conferir preços e disponibilidade.'}</span>
    <button type="button" onClick={() => void storefrontCatalog.refreshCatalog()}>{english ? 'Try again' : 'Tentar novamente'}</button>
  </div>;
}
