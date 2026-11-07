(function () {
  var nav = document.getElementById('side');
  if (!nav) return;
  var here = location.pathname.split('/').pop() || 'index.html';
  Array.prototype.forEach.call(nav.querySelectorAll('a[href]'), function (a) {
    if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'page');
  });
  var btn = document.getElementById('menu-toggle');
  if (btn) {
    if (window.matchMedia('(max-width:860px)').matches) nav.classList.add('collapsed');
    btn.addEventListener('click', function () { nav.classList.toggle('collapsed'); });
  }
})();
