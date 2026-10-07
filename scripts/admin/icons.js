// Small, local SVG set. Decorative icons never replace a control's accessible name.
const paths = {
  home: '<path d="m3 10 9-7 9 7"/><path d="M5 9v12h5v-7h4v7h5V9"/>',
  orders:
    '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/>',
  finance: '<path d="M12 2v20M17 6c-1-2-9-3-9 2 0 4 9 2 9 7 0 5-9 4-10 1"/>',
  products: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5M12 13v9M7 5l10 6"/>',
  store:
    '<path d="M4 10v11h16V10M3 10l2-7h14l2 7M3 10c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0M9 21v-7h6v7"/>',
  user: '<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3H6Z"/>',
  logout: '<path d="M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8M14 12H3m4-4-4 4 4 4"/>',
  chef: '<path d="M7 14a5 5 0 0 1-3-9 5 5 0 0 1 8-2 5 5 0 0 1 8 2 5 5 0 0 1-3 9M7 12v9h10v-9M10 12v5m4-5v5M7 18h10"/>',
  revenue: '<path d="M5 19v-4m7 4V9m7 10V4" stroke-width="3.5"/>',
  cart: '<path d="M3 4h3l3 12h10l2-9H7M10 10h7"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  ticket: '<path d="m6 3 2 2 4-2 4 2 2-2v6a3 3 0 0 0 0 6v6l-2-2-4 2-4-2-2 2v-6a3 3 0 0 0 0-6V3Z"/>',
  trend: '<path d="m3 18 6-7 4 3 7-10M15 4h5v5"/>',
  calendar: '<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 2v6m8-6v6M4 11h16"/>',
  coins:
    '<ellipse cx="15" cy="6" rx="6" ry="3"/><path d="M9 6v8c0 4 12 4 12 0V6M9 10c0 4 12 4 12 0"/><path d="M9 11c-7-1-10 5-4 6 4 1 7-1 7-1M3 14v5c0 3 11 4 12 0v-2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
};
export function icon(name, className = "") {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.orders}</svg>`;
}
export function brand() {
  return `<div class="brand"><svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path fill="currentColor" d="M3 15C4 1 36 1 37 15c0 2-2 3-4 3H7c-2 0-4-1-4-3ZM6 21h28a3 3 0 0 1 0 6H6a3 3 0 0 1 0-6Zm-2 9h32v3c0 3-3 5-6 5H10c-3 0-6-2-6-5v-3Z"/><path d="m11 10 2-2m13 5 2-1" stroke="white" stroke-linecap="round"/></svg><div>THE BURGER HOUSE<small>ÁREA DO PROPRIETÁRIO</small></div></div>`;
}
