// Cache only the offline notice and public app logo; never authenticated pages or API data.
const CACHE = 'itw-offline-v1';
const LOGOS = 'itw-branding-v1';
const logoKey = '/notification-logo';
function logoIcon(value){return typeof value==='string'&&value.length<=1500000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'/icon-192.png'}
async function notificationIcon(){try{const saved=await (await caches.open(LOGOS)).match(logoKey);return logoIcon(saved?await saved.text():null)}catch{return '/icon-192.png'}}
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.add('/offline.html'))); self.skipWaiting(); });
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('itw-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
  }
});
self.addEventListener('message', event => {
  if(event.data?.type==='APP_LOGO')event.waitUntil(caches.open(LOGOS).then(cache=>cache.put(logoKey,new Response(logoIcon(event.data.logo)))).catch(()=>{}));
  if (event.data === 'CLEAR_USER_STATE') event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('itw-')).map(key => caches.delete(key)))));
});
self.addEventListener('push', event => {
  event.waitUntil((async()=>{
    let data={};try{data=event.data?.json()||{}}catch{}
    // Always show a visible notification, including malformed/test payloads.
    const url=typeof data.url==='string'&&/^\/(?:#ticket\/TCK-\d+|\?ticket=TCK-\d+)?$/.test(data.url)?data.url:'/';
    await self.registration.showNotification(typeof data.title==='string'?data.title:'ITF · Ticket update',{requireInteraction:data.requireInteraction===true,body:typeof data.body==='string'?data.body:'Open ITF to check your tickets.',icon:await notificationIcon(),badge:'/icon-192.png',tag:typeof data.tag==='string'?data.tag:undefined,data:{url}});
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL(event.notification.data?.url||'/',self.location.origin);
    if(target.origin!==self.location.origin)return;
    // Query parameters survive the authentication round-trip; URL fragments may not.
    const key=target.searchParams.get('ticket')||target.hash.match(/^#ticket\/(TCK-\d+)$/)?.[1];
    target.hash='';target.search='';target.pathname='/';
    if(key&&/^TCK-\d+$/.test(key))target.searchParams.set('ticket',key);
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows)if(new URL(client.url).origin===target.origin){
      try{await client.focus();const navigated=await client.navigate(target.href);if(navigated)return;}catch{}
    }
    return self.clients.openWindow(target.href);
  })());
});
