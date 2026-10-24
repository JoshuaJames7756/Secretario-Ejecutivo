// Aplica el tema antes del primer pintado para evitar el parpadeo claro/oscuro.
// Vive en un archivo propio (y no en línea en index.html) para poder usar una política
// de seguridad de contenido que no permita scripts en línea.
(function () {
  try {
    var pref = localStorage.getItem('theme') || 'system';
    var dark =
      pref === 'dark' ||
      (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
