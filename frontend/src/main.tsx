const fonts = document.querySelector<HTMLLinkElement>('#tbh-storefront-fonts');
if (fonts) fonts.media = 'all';
void import('./mountStorefront');
