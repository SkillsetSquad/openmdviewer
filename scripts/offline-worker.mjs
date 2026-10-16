// Build-time source factory. Only the generated browser service worker is shipped.
export function offlineCachePrefix(base) {
  return `openmdviewer-${encodeURIComponent(base || "root")}::`;
}

export function offlineWorkerSource({ base, urls, version }) {
  const prefix = offlineCachePrefix(base);
  const legacyPrefix = `openmdviewer-${base || "root"}-`;
  return `/* Generated from the static build. No documents or external responses are cached. */
const CACHE=${JSON.stringify(prefix + version)};
const PREFIX=${JSON.stringify(prefix)};
const LEGACY_PREFIX=${JSON.stringify(legacyPrefix)};
const URLS=${JSON.stringify(urls)};
const ALLOWED=new Set(URLS.map(url=>new URL(url,self.location.origin).pathname));
const CONCURRENCY=8;
const ATTEMPTS=3;
const REQUEST_TIMEOUT=15000;
const INSTALL_TIMEOUT=120000;
function stopped(){return new Error('Offline cache installation stopped.');}
async function pause(milliseconds,signal){
 if(signal.aborted)throw stopped();
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(finish,milliseconds);
  function finish(){signal.removeEventListener('abort',abort);resolve();}
  function abort(){clearTimeout(timer);signal.removeEventListener('abort',abort);reject(stopped());}
  signal.addEventListener('abort',abort,{once:true});
 });
}
async function readAsset(url,signal){
 for(let attempt=0;attempt<ATTEMPTS;attempt++){
  if(signal.aborted)throw stopped();
  const request=new AbortController();
  const abort=()=>request.abort();
  signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,REQUEST_TIMEOUT);
  let retry=false;
  let failure;
  try{
   const response=await fetch(url,{signal:request.signal,cache:'reload'});
   if(response.ok){
    if(response.url&&new URL(response.url).origin!==self.location.origin)throw new Error('An offline asset redirected outside this app.');
    // Finish the body while request cancellation and time limits still apply.
    await response.clone().arrayBuffer();
    return response;
   }
   retry=response.status===408||response.status===429||response.status>=500;
   failure=new Error('Offline asset request failed with HTTP '+response.status+'.');
   if(response.body)await response.body.cancel().catch(()=>{});
  }catch(error){
   if(signal.aborted)throw stopped();
   failure=error;
   retry=error instanceof TypeError||error.name==='AbortError';
  }finally{
   clearTimeout(timer);
   signal.removeEventListener('abort',abort);
  }
  if(!retry||attempt===ATTEMPTS-1)throw failure;
  await pause(500*(attempt+1),signal);
 }
 throw stopped();
}
async function prepareCache(){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),INSTALL_TIMEOUT);
 let cursor=0;
 try{
  const cache=await caches.open(CACHE);
  const workers=Array.from({length:Math.min(CONCURRENCY,URLS.length)},async()=>{
   try{
    while(!controller.signal.aborted){
     const index=cursor++;
     if(index>=URLS.length)return;
     const url=URLS[index];
     const response=await readAsset(url,controller.signal);
     if(controller.signal.aborted)throw stopped();
     // Storage/quota errors are permanent for this attempt, never network retries.
     await cache.put(url,response);
    }
    throw stopped();
   }catch(error){controller.abort();throw error;}
  });
  const results=await Promise.allSettled(workers);
  const failure=results.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
  if(controller.signal.aborted)throw stopped();
 }catch(error){
  controller.abort();
  // Versioning includes this worker's exact logic, so the active version has a different cache.
  await caches.delete(CACHE).catch(()=>{});
  throw error;
 }finally{clearTimeout(timer);}
}
self.addEventListener('install',event=>event.waitUntil(prepareCache()));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&(key.startsWith(PREFIX)||(key.startsWith(LEGACY_PREFIX)&&/^[a-f0-9]{16}$/.test(key.slice(LEGACY_PREFIX.length))))).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'&&(url.pathname===${JSON.stringify(base + "/")}||url.pathname===${JSON.stringify(base + "/index.html")}))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(${JSON.stringify(base + "/")}))||fetch(event.request)));
 else if(ALLOWED.has(url.pathname))event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(event.request))||fetch(event.request)));
});
`;
}
