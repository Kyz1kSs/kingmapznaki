/* Настройки сайта. Сюда вписываются ключи — больше нигде править не нужно. */
window.CONFIG = {
  // Центр карты при открытии (центр Кингисеппа)
  center: [59.3738, 28.6018],
  zoom: 15,
  minZoom: 12,
  maxZoom: 18,

  // Спутник Esri World Imagery — работает без ключа
  esriImagery: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  esriMaxNativeZoom: 17,
  // Подписи улиц (прозрачный слой поверх спутника)
  esriLabels: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',

  // Ключ JavaScript API Яндекс.Карт (developer.tech.yandex.ru).
  // Нужен для панели панорам на сайте. Если пусто — панорама открывается
  // отдельной вкладкой на yandex.ru/maps.
  yandexApiKey: '81953726-4592-48cd-8a2a-278fcf7109c1',

  // Ключ Tiles API Яндекс.Карт. Сейчас НЕ используется: в Tiles API нет спутника,
  // только схема (`l=map`), поэтому подложка остаётся на Esri.
  yandexTilesKey: '41e2f928-5aac-4eb5-9d15-5452760a1b2a',

  // Бэкенд. Если url/anonKey пустые — сайт работает в локальном режиме
  // (правки видны только тебе и сохраняются в браузере, с экспортом в JSON).
  supabase: {
    url: 'https://bzsctvuutqqwkwikufqn.supabase.co',
    anonKey: 'sb_publishable_6q2Ht5BmQW9oK4cBaMIlZA_MnZTjUUz',
    table: 'signs'
  },

  // Максимальное расстояние от клика до дороги, чтобы точка «прилипла» к улице
  snapMeters: 45
};
