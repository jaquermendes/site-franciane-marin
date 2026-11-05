// Movimento discreto: entrada da capa e seções aparecendo ao rolar.
(function () {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('anima');
  var alvos = document.querySelectorAll('main > section:not(.hero) .secao-cabeca, main > section:not(.hero) > .container > *, .grupo, .caneta, .lista-perguntas, .chamada-final-inner');
  var obs = new IntersectionObserver(function (itens) {
    itens.forEach(function (i) {
      if (i.isIntersecting) { i.target.classList.add('visivel'); obs.unobserve(i.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  alvos.forEach(function (el) { el.classList.add('revelar'); obs.observe(el); });
})();
