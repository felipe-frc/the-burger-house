export type SalesPeriod = 'today' | '7days' | '30days';

export const formatOrdersCount = (count: number): string =>
  `${count} ${count === 1 ? 'pedido' : 'pedidos'}`;

export const formatItemsCount = (count: number): string =>
  `${count} ${count === 1 ? 'item' : 'itens'}`;
