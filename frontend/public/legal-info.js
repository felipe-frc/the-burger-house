// Public legal configuration only; never read Owner identity, cookies or private profiles.
fetch('/api/privacy/config', { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
  .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
  .then(config => {
    for (const element of document.querySelectorAll('[data-legal]')) {
      const value = config[element.getAttribute('data-legal')];
      if (typeof value === 'string' && value.trim()) element.textContent = value;
    }
  }).catch(() => { /* Explicit pending labels remain visible; never invent a contact. */ });
