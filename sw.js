const CACHE_NAME = 'frankenstein-v2';
const ASSETS = [
  './',
  './index.html',
  './story.html',
  './manifest.json',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/apple-touch-icon.png',
  './images/pic_contents.jpg',
  './images/pic1.jpg',
  './images/pic1_1.jpg',
  './images/pic1_2.jpg',
  './images/pic1_3.jpg',
  './images/pic2.jpg',
  './images/pic2_1.jpg',
  './images/pic2_2.jpg',
  './images/pic2_3.jpg',
  './images/pic3.jpg',
  './images/pic3_1.jpg',
  './images/pic3_2.jpg',
  './images/pic3_3.jpg',
  './images/pic4.jpg',
  './images/pic4_1.jpg',
  './images/pic4_2.jpg',
  './images/pic4_3.jpg',
  './images/pic5.jpg',
  './images/pic5_1.jpg',
  './images/pic5_2.jpg',
  './images/pic5_3.jpg',
  './images/pic6.jpg',
  './images/pic6_1.jpg',
  './images/pic6_2.jpg',
  './images/pic6_3.jpg',
  './images/tab.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.all(
          ASSETS.map(asset =>
            cache.add(asset).catch(err => {
              console.error('Failed to cache:', asset, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
