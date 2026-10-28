/* Псевдо-3D слой зданий: контуры из OpenStreetMap (data/buildings.js).
   Каждое здание — светлая «крыша» плюс тень-выступ на северо-восток,
   размер которого зависит от этажности: получается лёгкий 3D-эскиз,
   а не плоская карта. Рисуется только на ближних зумах. */
window.BuildingRender = (function () {
  var prepared = null;          // [[ring, shadowRing, h], ...]

  function prep() {
    if (prepared) return prepared;
    prepared = [];
    var bs = window.BUILDINGS || [];
    for (var i = 0; i < bs.length; i++) {
      var h = bs[i][0], r = bs[i][1];
      var d = Math.min(13, 1.1 + 0.95 * h);      // выступ на северо-восток, в метрах
      var sh = [];
      for (var k = 0; k < r.length; k++) sh.push(Geo.dest(r[k], 45, d));
      prepared.push([r, sh, h]);
    }
    return prepared;
  }

  function bbox(ring) {
    var minLat = ring[0][0], maxLat = minLat, minLng = ring[0][1], maxLng = minLng;
    for (var i = 1; i < ring.length; i++) {
      var la = ring[i][0], lo = ring[i][1];
      if (la < minLat) minLat = la; else if (la > maxLat) maxLat = la;
      if (lo < minLng) minLng = lo; else if (lo > maxLng) maxLng = lo;
    }
    return { minLat: minLat, maxLat: maxLat, minLng: minLng, maxLng: maxLng };
  }

  function inView(bb, b) {
    return !(bb.maxLat < b.getSouth() || bb.minLat > b.getNorth() ||
             bb.maxLng < b.getWest() || bb.minLng > b.getEast());
  }

  // Построить слой на текущем зуме. Пересуём на zoomend.
  function render(group, map) {
    group.clearLayers();
    var z = map.getZoom();
    if (z < 14) return 0;                       // далеко — снимаем «объём», чтобы не грузить карту
    var bs = prep();
    var bounds = map.getBounds();
    var n = bs.length, drawn = 0;
    // сначала собираем видимые здания в порядке «высокие сверху» не обязательно;
    // тень рисуем сразу перед крышей каждого здания
    for (var i = 0; i < n; i++) {
      var bb = bbox(bs[i][0]);
      if (!inView(bb, bounds)) continue;
      var h = bs[i][2];
      if (z < 15 && h <= 1) continue;            // на 14 зуме одноэтажки шумят — опускаем
      var roof = h >= 4
        ? { color: '#ffffff', weight: 1.1, opacity: 0.7, fillColor: '#efe8ff', fillOpacity: 0.34, interactive: false, pane: 'build' }
        : { color: '#ffffff', weight: 0.7, opacity: 0.42, fillColor: '#e8e1f8', fillOpacity: 0.14, interactive: false, pane: 'build' };
      // тень-выступ (рисуем первой — крыша встаёт поверх, «северная/восточная стенка» тёмная)
      L.polygon(bs[i][1], {
        color: '#05030c', weight: 0, fillColor: '#05030c',
        fillOpacity: Math.min(0.62, 0.3 + h * 0.05), interactive: false, pane: 'build'
      }).addTo(group);
      L.polygon(bs[i][0], roof).addTo(group);
      drawn++;
    }
    return drawn;
  }

  function count() { return (window.BUILDINGS || []).length; }

  return { render: render, prep: prep, count: count };
})();
