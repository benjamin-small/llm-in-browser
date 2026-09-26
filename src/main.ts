import './style.css';
import { modelBlockReason } from './device';
const asset = (path: string) => import.meta.env.BASE_URL + path.replace(/^\//, '');
import type { Request, Response, Manifest, StationEvent, Retrieval, Metrics } from './protocol';

const $ = <T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const status=$('status'),errorBox=$('error'),progress=$<HTMLProgressElement>('load-progress');
const message=$<HTMLTextAreaElement>('message'),send=$<HTMLButtonElement>('send'),stop=$<HTMLButtonElement>('stop');
const modelSelect=$<HTMLSelectElement>('model-select'),backendSelect=$<HTMLSelectElement>('backend-select');
let worker: Worker, ready=false,busy=false,modelReady=false,modelCached=false,active='',graphJson='',pendingGraph='',sequence=0,stopping:ReturnType<typeof setTimeout>|undefined;
let current: {article:HTMLElement;content:HTMLElement;details:HTMLDetailsElement;body:HTMLElement;retrieval?:Retrieval}|undefined;
let registry: {default:string;models:{id:string;name:string;manifest:string}[]}={default:'base-q8',models:[]};
let modelFiles: File[]|undefined;
const id=()=>String(++sequence);
function post(request:Request) { worker.postMessage(request); }
function controls() {
  send.disabled=!ready||busy;stop.hidden=!busy;
  $('new-chat').toggleAttribute('disabled',!ready||busy);
  modelSelect.disabled=busy;backendSelect.disabled=busy;
  for(const el of document.querySelectorAll<HTMLButtonElement>('[data-question],[data-event]')) el.disabled=!ready||busy;
  $<HTMLButtonElement>('starter-graph').disabled=!modelReady||busy;
  for(const el of document.querySelectorAll<HTMLInputElement>('input[type=file]')) el.disabled=busy;
  document.body.dataset.state=busy?'busy':ready?'ready':'error';
}
function fail(message:string,fatal=false) {
  errorBox.textContent=message;errorBox.hidden=false;busy=false;
  if(fatal){ready=false;modelReady=false;worker?.terminate();$('retry').hidden=false;$('load-panel').hidden=false;status.textContent='Model needs to be reloaded';$('backend-badge').textContent='Model stopped';progress.hidden=true;}
  current?.article.classList.remove('pending');controls();
  if(current&&!current.content.textContent)current.content.textContent='No reply was completed.';
}
function clearError(){errorBox.hidden=true;errorBox.textContent='';}
function scroll(){const c=$('conversation');c.scrollTop=c.scrollHeight;}
function addMessage(role:'user'|'assistant',text:string) {
  $('welcome').hidden=true;
  const article=document.createElement('article');article.className='message '+role;
  const speaker=document.createElement('div');speaker.className='speaker';speaker.textContent=role==='user'?'YOU':'✳ ASTER';
  const content=document.createElement('div');content.className='content';content.textContent=text;
  article.append(speaker,content);$('messages').append(article);scroll();return {article,content};
}
function renderEvidence(retrieval:Retrieval,metrics?:Metrics) {
  if(!current)return;current.retrieval=retrieval;current.body.replaceChildren();
  current.details.querySelector('summary')!.textContent=`${retrieval.facts.length} supplied facts · evidence & performance`;
  for(const fact of retrieval.facts){const row=document.createElement('div');row.className='fact';row.textContent=fact.text;const code=document.createElement('small');code.textContent=fact.id;row.append(code);current.body.append(row);}
  if(retrieval.ambiguity.length||retrieval.notice||!retrieval.facts.length){const note=document.createElement('p');note.textContent=retrieval.notice || (retrieval.ambiguity.length?'Ambiguous name: '+retrieval.ambiguity.join(', '):'No facts supplied.');current.body.append(note);}
  if(metrics){const m=document.createElement('div');m.className='metrics';m.textContent=[
    `${metrics.inputTokens} input + ${metrics.outputTokens} output tokens · ${metrics.stopReason}`,
    `First token: ${metrics.firstTokenMs===null?'n/a':(metrics.firstTokenMs/1000).toFixed(2)+' s'} · Decode: ${metrics.tokensPerSecond.toFixed(1)} tokens/s`,
    `Weights: ${(metrics.modelBytes/1e6).toFixed(1)} MB · WASM heap: ${(metrics.wasmMemoryBytes/1e6).toFixed(0)} MB (excludes GPU and JS)`,
    `Backend: ${metrics.backend.backend} · GPU decoding ${metrics.gpuDecodeVerified?'verified with nonzero, finite logits':'not verified / CPU'}`,
    `${metrics.droppedTurns} older turns and ${metrics.droppedFacts} lower-ranked facts omitted to fit context.`,
    'Evidence was supplied to the model; it does not prove every statement in the reply.'
  ].join('\n');current.body.append(m);}
}
function handle(r:Response) {
  if(r.id!==active)return;
  switch(r.type){
    case 'progress': status.textContent=r.message;if(r.percent===undefined)progress.removeAttribute('value');else progress.value=r.percent;break;
    case 'ready':
      modelReady=true;modelCached=r.cached;
      try{localStorage.setItem('aster-model',modelSelect.value);}catch{}
      $('backend-badge').textContent=r.backend.backend==='webgpu'?'WebGPU · weights ready':'CPU / WASM';
      $('model-detail').textContent=`${r.manifest.quantization} · ${r.manifest.training?'Locally fine-tuned':'Base model'} · ${(r.manifest.files.weights.bytes/1e6).toFixed(0)} MB`;
      if(r.manifest.datasetVersion)$('model-detail').textContent+=' · '+r.manifest.datasetVersion;
      if(r.manifest.quantization==='Q4_0')$('model-detail').textContent+=' · expands to Q8 in memory';
      if(r.warning){errorBox.textContent=r.warning;errorBox.hidden=false;}
      active=id();pendingGraph=graphJson;post({type:'graph',id:active,json:graphJson});break;
    case 'graph':
      graphJson=pendingGraph;try{localStorage.setItem('aster-graph',graphJson);}catch{/* The graph stays usable in memory if storage is full. */}
      $('graph-name').textContent=r.summary.name;$('graph-size').textContent=`${r.summary.entities} entities · ${r.summary.facts} facts`;
      ready=true;busy=false;$('load-panel').hidden=true;clearConversation();controls();void offlineStatus();break;
    case 'evidence':renderEvidence(r.retrieval);$('context-status').textContent=`${r.inputTokens} / 1,792 prompt tokens · ${r.droppedTurns} older turns omitted`;break;
    case 'chunk':if(current){current.content.textContent=r.text;scroll();}break;
    case 'complete':
      clearTimeout(stopping);if(current){current.article.classList.remove('pending');current.content.textContent=r.text||'(No response tokens generated.)';renderEvidence(current.retrieval!,r.metrics);}
      if(r.metrics.gpuDecodeVerified)$('backend-badge').textContent='WebGPU · decoding verified';busy=false;controls();scroll();break;
    case 'reset':clearConversation();busy=false;controls();break;
    case 'error':clearTimeout(stopping);fail(r.message,r.fatal);if(modelReady&&!ready){status.textContent='Import a valid graph or restore the starter graph.';progress.hidden=true;}break;
  }
}
function clearConversation(){ $('messages').replaceChildren();$('welcome').hidden=false;current=undefined;$('context-status').textContent='2,048-token context · up to 256 response tokens'; }
async function load() {
  const blocked = modelBlockReason(navigator);
  if (blocked) { errorBox.textContent=blocked; errorBox.hidden=false; return; }
  clearError();$('retry').textContent='Retry';worker?.terminate();worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
  worker.onmessage=({data}:MessageEvent<Response>)=>handle(data);
  worker.onerror=e=>{e.preventDefault();fail('The model worker stopped: '+e.message+'. Press Retry to reload it.',true);};
  ready=false;modelReady=false;busy=true;active=id();$('retry').hidden=true;$('load-panel').hidden=false;progress.hidden=false;status.textContent='Loading the local model…';controls();
  const selected=registry.models.find(m=>m.id===modelSelect.value)!;
  post({type:'init',id:active,manifestUrl:new URL(asset(selected.manifest),location.origin).href,backend:backendSelect.value as 'auto'|'cpu',files:modelFiles});
}
async function ask(text:string,event?:StationEvent) {
  if(!ready||busy)return;
  clearError();if(!text.trim())return;
  if(!event&&text.trim().startsWith('{')){try{const value=JSON.parse(text);if(typeof value.type!=='string'||typeof value.entityId!=='string'||!value.payload||Array.isArray(value.payload))throw new Error('Expected {type, entityId, payload}.');event=value;}catch(e){fail('Invalid event JSON: '+String(e));return;}}
  addMessage('user',text);current={...addMessage('assistant',''),details:document.createElement('details'),body:document.createElement('div')};
  current.article.classList.add('pending');current.details.append(document.createElement('summary'));current.body.className='evidence-body';current.details.append(current.body);current.article.append(current.details);
  message.value='';busy=true;active=id();controls();post({type:'generate',id:active,text,event,retrieval:$<HTMLInputElement>('retrieval').checked});
}
async function importGraph(json:string){if(!modelReady||busy)return;clearError();if(json.length>5_000_000){fail('Graph exceeds the 5 MB import limit.');return;}pendingGraph=json;busy=true;active=id();controls();post({type:'graph',id:active,json});}
$('chat-form').addEventListener('submit',e=>{e.preventDefault();void ask(message.value);});
message.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void ask(message.value);}});
$('retry').onclick=()=>void load();
$('new-chat').onclick=()=>{busy=true;active=id();controls();post({type:'reset',id:active});};
stop.onclick=()=>{
  if(!busy)return;post({type:'cancel',id:active});
  stopping=setTimeout(()=>{worker.terminate();current?.article.classList.remove('pending');fail('Stopped. Reload the model to start again; the worker was terminated during loading or prefill.',true);},300);
};
modelSelect.onchange=()=>{modelFiles=undefined;void load();};backendSelect.onchange=()=>void load();
document.querySelectorAll<HTMLButtonElement>('[data-question]').forEach(b=>b.onclick=()=>void ask(b.dataset.question!));
const events:Record<string,StationEvent>={device_alert:{type:'device_alert',entityId:'device-01',payload:{severity:'warning',message:'Temperature above range'}},visitor_arrived:{type:'visitor_arrived',entityId:'room-01',payload:{visitor:'Alex Rivera',host:'Mira Vale'}},stock_low:{type:'stock_low',entityId:'supply-01',payload:{remaining:2}}};
document.querySelectorAll<HTMLButtonElement>('[data-event]').forEach(b=>b.onclick=()=>void ask(JSON.stringify(events[b.dataset.event!],null,2),events[b.dataset.event!]));
$<HTMLInputElement>('graph-file').onchange=async e=>{const input=e.target as HTMLInputElement;const file=input.files?.[0];if(file){if(file.size>5_000_000)fail('Graph exceeds the 5 MB import limit.');else await importGraph(await file.text());}input.value='';};
$('starter-graph').onclick=async()=>{try{await importGraph(await(await fetch(asset('/data/station.json'))).text());}catch(e){fail(String(e));}};
$<HTMLInputElement>('bundle-file').onchange=async e=>{
  const input=e.target as HTMLInputElement;const files=Array.from(input.files??[]);input.value='';if(!files.length)return;
  try{const file=files.find(f=>f.name==='manifest.json');if(!file||file.size>100000)throw new Error('Select manifest.json and every listed file in the bundle.');const manifest:Manifest=JSON.parse(await file.text());
    const cache=await caches.open('aster-local-v1');await cache.put(asset('/models/imported/manifest.json'),new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));
    registry.models=registry.models.filter(m=>m.id!=='imported');registry.models.push({id:'imported',name:'Imported · '+manifest.name,manifest:'/models/imported/manifest.json'});
    renderModels('imported');modelFiles=files;void load();
  }catch(e){fail(String(e));}
};
function renderModels(selected:string){modelSelect.replaceChildren(...registry.models.map(m=>new Option(m.name,m.id)));modelSelect.value=selected;}
async function offlineStatus(){
  try{
    $('offline-status').textContent=navigator.serviceWorker.controller&&modelCached?'App cached · model files saved locally':'Local files loaded · offline cache incomplete';
  }catch{$('offline-status').textContent='Browser storage unavailable';}
}
async function start(){
  controls();
  if(!window.isSecureContext){
    status.textContent='Browser setup needed for LAN chat';
    progress.hidden=true;$('retry').hidden=true;
    errorBox.textContent=`This HTTP LAN address cannot use the browser features required by Aster. For this local Chrome test, open chrome://flags/#unsafely-treat-insecure-origin-as-secure, add exactly ${location.origin}, enable it, and relaunch Chrome. Remove that entry after testing. A trusted HTTPS connection or a localhost SSH tunnel also works. The model runs on the computer opening this page.`;
    errorBox.hidden=false;$('backend-badge').textContent='Secure context required';return;
  }
  try{
    registry=await(await fetch(asset('/models/registry.json'))).json();
    const imported=await caches.match(asset('/models/imported/manifest.json'));
    if(imported){const m:Manifest=await imported.json();registry.models.push({id:'imported',name:'Imported · '+m.name,manifest:'/models/imported/manifest.json'});}
    const saved=localStorage.getItem('aster-model');renderModels(registry.models.some(m=>m.id===saved)?saved!:registry.default);
    graphJson=localStorage.getItem('aster-graph')||await(await fetch(asset('/data/station.json'))).text();
    if('serviceWorker' in navigator){await navigator.serviceWorker.register(asset('/sw.js'));navigator.serviceWorker.addEventListener('controllerchange',()=>void offlineStatus());}
    const blocked=modelBlockReason(navigator);
    progress.hidden=true;
    document.querySelector<HTMLElement>('.spinner')!.hidden=true;
    $('backend-badge').textContent=blocked?'Desktop required':'Model not loaded';
    status.textContent=blocked?'Local AI unavailable on this device':'Ready to load the experimental demo';
    $('retry').hidden=!!blocked; $('retry').textContent='Load model';
    if(blocked){errorBox.textContent=blocked;errorBox.hidden=false;}
    $('load-note').textContent='About 233 MB to download. Running the model can use roughly 2 GB of WASM memory plus GPU and browser memory. A desktop with at least 8 GB RAM is recommended. Questions stay on this device.';
  }catch(e){fail('Startup failed: '+String(e)+'. Run npm run build and npm run dev, then reload.',true);}
}
void start();
