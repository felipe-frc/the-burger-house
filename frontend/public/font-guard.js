(function () {
  var root = document.documentElement;
  root.classList.add('tbh-fonts-pending');

  var released = false;
  var timeout;

  function release() {
    if (released) return;
    released = true;
    clearTimeout(timeout);
    root.classList.remove('tbh-fonts-pending');
  }

  function loadFonts() {
    if (!document.fonts || !document.fonts.load) {
      release();
      return;
    }

    timeout = setTimeout(function () {
      console.warn('[TBH] Font loading timeout; releasing typography.');
      release();
    }, 6000);

    Promise.all([
      document.fonts.load('400 16px Anton'),
      document.fonts.load('600 16px "Barlow Condensed"')
    ]).then(function (results) {
      if (results.some(function (faces) { return faces.length === 0; })) {
        console.warn('[TBH] A required web font was not available.');
      }
      release();
    }).catch(function (error) {
      console.warn('[TBH] Font loading failed:', error);
      release();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFonts, { once: true });
  } else {
    loadFonts();
  }
})();
