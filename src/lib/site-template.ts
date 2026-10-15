/** Self-contained assets for exported sites. No application runtime or remote dependencies. */
export const siteCSS = `
:root{color-scheme:dark;--bg:#101419;--panel:#171d25;--text:#e6edf5;--muted:#a8b6c8;--border:#364252;--accent:#80bdff}
:root[data-theme=light]{color-scheme:light;--bg:#fff;--panel:#f0f4f8;--text:#172335;--muted:#46566d;--border:#b6c2d1;--accent:#125bab}
*{box-sizing:border-box}html{scroll-padding-top:80px}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}a{color:var(--accent)}button,input{font:inherit}button,input{background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px 12px}button{cursor:pointer}button:disabled{opacity:.55;cursor:default}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.skip{position:fixed;top:-80px;left:12px;z-index:5;background:var(--panel);padding:10px}.skip:focus{top:8px}header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}header a{font-weight:700;text-decoration:none}header button{flex-shrink:0}.layout{display:grid;grid-template-columns:270px minmax(0,1fr) 230px;max-width:1700px;margin:auto}.sidebar,.toc{padding:24px;min-width:0}.sidebar{border-right:1px solid var(--border)}.sidebar input{width:100%}.sidebar ul,.toc ul{list-style:none;padding:0}.sidebar li{margin:10px 0}.sidebar a{display:block;line-height:1.4;text-decoration:none}.sidebar a[aria-current=page]{font-weight:700;text-decoration:underline}.sidebar small,.muted{color:var(--muted);font-size:.85rem}.sidebar small{display:block}.pager{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.toc{border-left:1px solid var(--border);font-size:.875rem}.toc li{margin:8px 0}.toc a{display:block}.toc .nested{padding-left:12px}main{min-width:0;padding:40px clamp(20px,5vw,80px);max-width:1100px;width:100%;margin:0 auto;align-self:start}main>:first-child{margin-top:0}article{min-width:0}article h1{font-size:2rem;line-height:1.3}article h2{margin-top:2em;border-bottom:1px solid var(--border);padding-bottom:.3em}article h3{margin-top:1.7em}article img,article video{max-width:100%;height:auto}article audio{max-width:100%}pre{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:18px;overflow:auto;white-space:pre;font:14px/1.6 ui-monospace,monospace}code{font-family:ui-monospace,monospace}table{display:block;width:100%;overflow:auto;border-collapse:collapse}th,td{border:1px solid var(--border);padding:8px 12px}th{background:var(--panel)}blockquote{border-left:3px solid var(--accent);margin-left:0;padding:8px 18px;background:var(--panel)}dt{font-weight:700}dd{margin:8px 0 18px 24px}footer{border-top:1px solid var(--border);padding:18px 24px;color:var(--muted);font-size:.85rem}.document-list li{margin:12px 0}.media-note{color:var(--muted);border:1px dashed var(--border);padding:10px}.site-doc-heading{margin-bottom:24px}.site-doc-heading h1{margin-bottom:8px}.site-doc-heading p{margin:0}mark{background:#f0d56c;color:#172335}[hidden]{display:none!important}
@media(max-width:1100px){.layout{grid-template-columns:240px minmax(0,1fr)}.toc{grid-column:2;border-left:0;border-top:1px solid var(--border);padding:24px 32px}}
@media(max-width:700px){header{padding:12px 16px}.layout{display:flex;flex-direction:column}.sidebar{border-right:0;border-bottom:1px solid var(--border);padding:16px}.sidebar details:not([open]){max-height:80px}.toc{order:1;padding:16px}main{order:2;padding:24px 18px}.sidebar{order:0}article h1{font-size:1.7rem}footer{padding:16px}}
@media print{header,.sidebar,.toc,footer,.skip{display:none}.layout{display:block}main{max-width:none;padding:0}body{background:white;color:black;font-size:11pt}a{color:inherit}pre,blockquote,th{background:#f3f3f3}pre{white-space:pre-wrap}table{display:table}img{break-inside:avoid}}
`;

// Text/links are created with DOM APIs. Imported strings are never assigned to innerHTML.
export const siteJS = `"use strict";
(() => {
 const data=window.openmdSite; if(!Array.isArray(data))return;
 const theme=document.getElementById('site-theme');
 const key='openmdviewer-site-theme:'+new URL('.',location.href).pathname;
 let selected='dark';try{selected=localStorage.getItem(key)||'dark';}catch{}
 if(selected!=='light'&&selected!=='dark')selected='dark';
 function apply(){document.documentElement.dataset.theme=selected;theme.textContent=selected==='dark'?'Use light theme':'Use dark theme';}
 apply();theme.addEventListener('click',()=>{selected=selected==='dark'?'light':'dark';apply();try{localStorage.setItem(key,selected);}catch{}});
 const input=document.getElementById('site-search'),list=document.getElementById('site-documents'),status=document.getElementById('site-status'),prev=document.getElementById('site-prev'),next=document.getElementById('site-next');
 let matches=data,offset=0,timer;const size=50;
 function render(){
  list.replaceChildren();const fragment=document.createDocumentFragment();
  for(const item of matches.slice(offset,offset+size)){
   const li=document.createElement('li'),a=document.createElement('a'),small=document.createElement('small');
   a.href=item.url;a.textContent=item.title;if(location.pathname.endsWith('/'+item.url))a.setAttribute('aria-current','page');
   small.textContent=item.path;li.append(a,small);fragment.append(li);
  }
  list.append(fragment);status.textContent=matches.length?(offset+1)+'–'+Math.min(offset+size,matches.length)+' of '+matches.length+' documents':'No matching documents';
  prev.disabled=offset===0;next.disabled=offset+size>=matches.length;
 }
 input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{
  const terms=input.value.trim().toLocaleLowerCase().split(/\\s+/).filter(Boolean);
  matches=terms.length?data.filter(item=>{const value=(item.title+' '+item.path+' '+item.text).toLocaleLowerCase();return terms.every(term=>value.includes(term));}):data;offset=0;render();
 },150);});
 prev.addEventListener('click',()=>{offset=Math.max(0,offset-size);render();});next.addEventListener('click',()=>{offset+=size;render();});
 document.getElementById('site-enhanced').hidden=false;
 if(matchMedia('(max-width:700px)').matches)document.querySelector('.sidebar details').open=false;
 render();
})();`;

export function escapeHTML(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

export function sitePage(
  title: string,
  siteTitle: string,
  body: string,
  toc: string,
) {
  const escape = escapeHTML;
  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>${escape(title)} · ${escape(siteTitle)}</title><link rel="stylesheet" href="site.css"><script src="search-data.js" defer></script><script src="site.js" defer></script></head><body><a class="skip" href="#site-main">Skip to content</a><header><a href="index.html">${escape(siteTitle)}</a><button id="site-theme" type="button">Use light theme</button></header><div class="layout"><aside class="sidebar" aria-label="Document navigation"><details open><summary>Documents</summary><p><a href="index.html">All documents</a></p><div id="site-enhanced" hidden><label for="site-search">Search this site</label><input id="site-search" type="search" maxlength="200" placeholder="Title, path or document text"><p id="site-status" role="status"></p><ul id="site-documents"></ul><div class="pager"><button id="site-prev" type="button">Previous results</button><button id="site-next" type="button">Next results</button></div></div><noscript><p>Search and theme switching need JavaScript. All documents remain readable from the index.</p></noscript></details></aside><main id="site-main" tabindex="-1">${body}</main><nav class="toc" aria-label="On this page"><strong>On this page</strong>${toc || "<p>No document headings.</p>"}</nav></div><footer>Exported with OpenMDViewer. Documents and linked local assets are included; remote media is not loaded.</footer></body></html>`;
}
/** License applies to generated template code, not user documents. */
export const siteLicense = `MIT License

Copyright (c) 2026 SkillsetSquad

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
