/* Панель панорам Яндекс.Карт: показывает панораму в точке, чтобы сверять знаки. */
window.Panorama = (function () {
  var loading = null;
  var player = null;
  var box = null;

  function hasApi() { return !!(window.CONFIG && window.CONFIG.yandexApiKey); }

  function loadApi() {
    if (!hasApi()) return Promise.reject(new Error('no-key'));
    if (window.ymaps) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://api-maps.yandex.ru/2.1/?apikey=' + encodeURIComponent(window.CONFIG.yandexApiKey) + '&lang=ru_RU';
      s.onload = function () {
        if (!window.ymaps) return reject(new Error('ymaps не загрузился'));
        window.ymaps.ready(function () { resolve(); });
      };
      s.onerror = function () { reject(new Error('не удалось загрузить API Яндекс.Карт')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function externalLink(latlng) {
    return 'https://yandex.ru/maps/?ll=' + latlng[1] + ',' + latlng[0] +
      '&z=18&l=stv%2Csta&panorama%5Bpoint%5D=' + latlng[1] + '%2C' + latlng[0] +
      '&panorama%5Bdirection%5D=0%2C0&panorama%5Bspan%5D=90%2C75';
  }

  function show(latlng, container, onStatus) {
    box = container;
    function fallback(msg) {
      if (onStatus) onStatus(msg);
      box.innerHTML = '<div class="pano-fallback">' +
        '<p>' + (msg || 'Панорама недоступна') + '</p>' +
        '<a target="_blank" rel="noopener" href="' + externalLink(latlng) + '">Открыть панораму в Яндекс.Картах ↗</a>' +
        '</div>';
    }
    if (!hasApi()) {
      fallback('Ключ API Яндекс.Карт не задан — панорама откроется в новой вкладке.');
      return;
    }
    loadApi().then(function () {
      return window.ymaps.panorama.locate([latlng[0], latlng[1]]);
    }).then(function (panoramas) {
      if (!panoramas || !panoramas.length) {
        fallback('В этой точке нет панорамы. Кликни ближе к улице.');
        return;
      }
      if (player) { try { player.destroy(); } catch (e) {} player = null; }
      box.innerHTML = '<div id="pano-player" class="pano-player"></div>';
      player = new window.ymaps.panorama.Player('pano-player', panoramas[0], {
        direction: [0, 0],
        controls: ['panoramaZoomControl', 'panoramaFullscreenControl']
      });
      if (onStatus) onStatus('Панорама загружена');
    }).catch(function (e) {
      fallback('Панорама недоступна: ' + e.message);
    });
  }

  function destroy() {
    if (player) { try { player.destroy(); } catch (e) {} player = null; }
    if (box) box.innerHTML = '';
  }

  return { hasApi: hasApi, show: show, destroy: destroy, externalLink: externalLink };
})();
