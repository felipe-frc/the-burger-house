// Match only routes the Owner implements; asset paths never receive an SPA document.
export const ownerSpaRoute = '/admin(?:/?|/(?:dashboard|orders|kitchen|dispatch|deliveries|products|inventory|customers|finance|reports|team|settings|security|store)/?|/(?:orders|courier)/[1-9][0-9]*/?)';
export const isOwnerSpaRoute = pathname => new RegExp(`^${ownerSpaRoute}$`).test(pathname);
