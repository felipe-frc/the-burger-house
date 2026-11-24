import { adminRequest } from './adminHttp';
import type { MenuItem } from '../types';
import { storefrontProductId } from '../../../shared/storefront/features/catalog/catalog';
import { BURGERS, SIDES_AND_DRINKS } from '../../../frontend/src/utils/menu';
import { productImage } from '../../../frontend/src/utils/productImage';

const curatedPhotos = new Map([...BURGERS, ...SIDES_AND_DRINKS].map(item => [item.id, productImage(item.image, '').src]));
const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
const maximumImageSize = 5 * 1024 * 1024;
export interface ProductDto {
  id: number; code?: string; name: string; description: string; price: number; costPrice: number | null;
  isActive: boolean; englishName: string; englishDescription: string;
  category: 'menu' | 'sides' | 'drinks'; displayOrder: number; imageUrl: string | null;
}
export function mapProduct(product: ProductDto): MenuItem {
  const uploadedImage = /^\/api\/product-images\/[a-f0-9]{32}\.webp$/.test(product.imageUrl ?? '');
  const publicId = storefrontProductId({ code: product.code ?? '', name: product.name });
  return { id: String(product.id), name: product.name, description: product.description, price: product.price,
    cost: product.costPrice ?? 0, costKnown: product.costPrice !== null, available: product.isActive, category: product.category === 'menu' ? 'burgers' : product.category,
    orderIndex: product.displayOrder, prepTimeMinutes: 0,
    englishName: product.englishName, englishDescription: product.englishDescription,
    uploadedImage, imageUrl: uploadedImage ? product.imageUrl! : publicId ? curatedPhotos.get(publicId) : undefined };
}
export const loadProducts = (signal?: AbortSignal) => adminRequest<ProductDto[]>('/api/admin/products', { signal });
export async function saveProduct(item: MenuItem, original?: ProductDto) {
  if (item.category === 'desserts') throw new Error('Categoria não suportada pelo servidor.');
  const payload = { name: item.name, description: item.description, price: item.price,
    costPrice: item.costKnown === false || (item.costKnown === undefined && original?.costPrice === null && item.cost === 0) ? null : item.cost,
    isActive: item.available, englishName: item.englishName ?? original?.englishName ?? '',
    englishDescription: item.englishDescription ?? original?.englishDescription ?? '',
    category: item.category === 'burgers' ? 'menu' : item.category, displayOrder: item.orderIndex };
  await adminRequest(original ? `/api/admin/products/${original.id}` : '/api/admin/products', { method: original ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
}
export function translateProduct(name: string, description: string) {
  return adminRequest<{ englishName: string; englishDescription: string }>('/api/admin/products/translate', {
    method: 'POST', body: JSON.stringify({ name, description }),
  });
}
export async function setProductAvailability(product: ProductDto) {
  await adminRequest(`/api/admin/products/${product.id}`, { method: 'PATCH', body: JSON.stringify({ ...product, isActive: !product.isActive }) });
}
export function validateProductImage(file: File) {
  if (!imageTypes.includes(file.type)) throw new Error('Selecione uma imagem JPG, PNG ou WebP.');
  if (file.size === 0 || file.size > maximumImageSize) throw new Error('A imagem deve ter conteúdo e no máximo 5 MB.');
}

export async function uploadProductImage(id: number, file: File) {
  validateProductImage(file);
  const body = new FormData(); body.append('file', file);
  return adminRequest<{ imageUrl: string }>(`/api/admin/products/${id}/image`, { method: 'POST', body });
}
export const deleteProductImage = (id: number) => adminRequest(`/api/admin/products/${id}/image`, { method: 'DELETE' });
