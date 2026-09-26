import type { Request, Response, Manifest, BundleFile, Retrieval } from './protocol';
import { boundPrompt, type Message } from './prompt';
import { initializeBackend } from './backend';
import type { FlareEngine, FlareTokenizer, InitOutput } from './runtime/flare_web';
import type { StationGraph } from './runtime/station_core';

const send = (message: Response) => postMessage(message);
// Yield a task so cancellation can run on the CPU path too. Browser background
// timer throttling can reduce setTimeout-based decoding to one token per second.
const channel = new MessageChannel();
const tasks: Array<()=>void> = [];
channel.port1.onmessage = () => tasks.shift()?.();
const tick = () => new Promise<void>(resolve => {tasks.push(resolve);channel.port2.postMessage(null);});
let engine: FlareEngine | undefined, tokenizer: FlareTokenizer | undefined, graph: StationGraph | undefined;
let wasm: InitOutput, manifest: Manifest, system = '', history: Message[] = [], previous: string[] = [];
let active = '', cancelled = false, busy = false;
let diagnostic = '';
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => { diagnostic=args.map(String).join(' ').slice(-6000);consoleError(...args); };
let graphClass: typeof StationGraph;
const CACHE = 'aster-models-v1';
const emptyRetrieval = (): Retrieval => ({entityIds:[],facts:[],ambiguity:[],notice:null});
async function hash(bytes: Uint8Array): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), b=>b.toString(16).padStart(2,'0')).join('');
}
function localUrl(path: string, base: string): string {
  const url = new URL(path, base);
  if(url.origin !== location.origin || !['http:','https:'].includes(url.protocol)) throw new Error('Model files must be on this local origin. Import an offline bundle for other models.');
  return url.href;
}
function validateManifest(value: Manifest): Manifest {
  if(value.schemaVersion !== 1 || !value.id || !['Q8_0','Q4_0'].includes(value.quantization) || value.model !== 'HuggingFaceTB/SmolLM2-360M-Instruct') throw new Error('This build supports version-1 SmolLM2-360M-Instruct Q4_0/Q8_0 bundles.');
  for (const role of ['weights','tokenizer','tokenizerConfig','config','generationConfig'] as const) {
    const f = value.files?.[role];
    if(!f || typeof f.path!=='string' || !/^[a-f0-9]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes<=0 || f.bytes>800_000_000) throw new Error(`Invalid ${role} file in manifest.`);
  }
  return value;
}
async function loadFile(entry: BundleFile, base: string, files: File[] | undefined, id: string, cache: Cache | undefined): Promise<{bytes: Uint8Array; cached: boolean}> {
  const cacheKey = `${location.origin}/__models/${entry.sha256}`;
  let response = await cache?.match(cacheKey), cached=!!response;
  if (!response) {
    if(files) {
      const file = files.find(f => f.name === entry.path.split('/').at(-1));
      if(!file) throw new Error(`Bundle is missing ${entry.path}. Select its manifest and every listed file.`);
      response = new Response(file);
    } else {
      response = await fetch(localUrl(entry.path,base), {signal:AbortSignal.timeout(120000)});
      if(!response.ok) throw new Error(`Could not load ${entry.path} (HTTP ${response.status}). Run npm run setup:assets, or select a complete local bundle.`);
    }
  }
  if(!response.body) throw new Error('The model file has no readable body.');
  const bytes = new Uint8Array(entry.bytes), reader=response.body.getReader();
  let loaded=0, last=-1;
  while(true) {
    const {done,value}=await reader.read(); if(done) break;
    if(loaded+value.length>bytes.length) { await reader.cancel(); throw new Error(`Wrong file size: ${entry.path}`); }
    bytes.set(value,loaded); loaded+=value.length;
    const percent=Math.floor(loaded/bytes.length*100);
    if(percent!==last) {send({type:'progress',id,message:`${cached?'Reading cached':'Loading local'} ${entry.path.split('/').at(-1)} · ${(loaded/1e6).toFixed(0)} / ${(bytes.length/1e6).toFixed(0)} MB`,percent}); last=percent;}
  }
  if(loaded!==entry.bytes || await hash(bytes)!==entry.sha256) {await cache?.delete(cacheKey); throw new Error(`Integrity check failed for ${entry.path}. Replace the bundle file and retry.`);}
  if(!cached && cache) { try { await cache.put(cacheKey,new Response(bytes,{headers:{'Content-Type':'application/octet-stream'}})); cached=true; } catch {send({type:'progress',id,message:'Browser storage is full. This model will work now, but cannot be saved for offline reload.'});} }
  return {bytes,cached};
}
async function initialize(r: Extract<Request,{type:'init'}>) {
  engine?.free(); tokenizer?.free(); engine=undefined; tokenizer=undefined; history=[];previous=[];
  const base=localUrl(r.manifestUrl, location.href);
  const manifestResponse = r.files ? undefined : await fetch(base).catch(()=>caches.match(base));
  const source = r.files ? await r.files.find(f=>f.name==='manifest.json')?.text() : await (manifestResponse?.ok ? manifestResponse : await caches.match(base))?.text();
  if(!source) throw new Error('Select manifest.json and all files in the model bundle.');
  manifest=validateManifest(JSON.parse(source));
  send({type:'progress',id:r.id,message:'Starting Rust/WASM inference and retrieval'});
  const flarePath=import.meta.env.BASE_URL+'runtime/flare/flare_web.js', graphPath=import.meta.env.BASE_URL+'runtime/station/station_core.js';
  const flare: typeof import('./runtime/flare_web') = await import(/* @vite-ignore */ flarePath);
  const station: typeof import('./runtime/station_core') = await import(/* @vite-ignore */ graphPath);
  wasm=await flare.default(); await station.default(); graphClass=station.StationGraph;
  system=(await (await fetch(import.meta.env.BASE_URL+'data/prompt.json')).json()).system;
  let cache: Cache | undefined;
  try { cache=await caches.open(CACHE); } catch { /* Storage can be unavailable in private sessions. */ }
  const tokenFile=await loadFile(manifest.files.tokenizer,base,r.files,r.id,cache);
  tokenizer=flare.FlareTokenizer.from_json(new TextDecoder().decode(tokenFile.bytes));
  const configFile=await loadFile(manifest.files.tokenizerConfig,base,r.files,r.id,cache);
  const tokenConfig=JSON.parse(new TextDecoder().decode(configFile.bytes));
  if(tokenConfig.eos_token!=='<|im_end|>' || !tokenConfig.chat_template?.includes("message['role']")) throw new Error('The bundle must preserve the original SmolLM2 chat template and special tokens.');
  // Verify the original architecture/config files as well as the actual weights/tokenizer.
  const architectureFile=await loadFile(manifest.files.config,base,r.files,r.id,cache);
  const generationFile=await loadFile(manifest.files.generationConfig,base,r.files,r.id,cache);
  const model=await loadFile(manifest.files.weights,base,r.files,r.id,cache);
  send({type:'progress',id:r.id,message:'Parsing verified weights in WASM'}); await tick();
  engine=flare.FlareEngine.load(model.bytes);
  if(r.backend==='auto')send({type:'progress',id:r.id,message:'Uploading weights to WebGPU'});
  const warning=await initializeBackend(engine,r.backend);
  send({type:'ready',id:r.id,manifest,backend:JSON.parse(engine.backend_info()),cached:[tokenFile,configFile,architectureFile,generationFile,model].every(f=>f.cached),warning});
}
async function generate(r: Extract<Request,{type:'generate'}>) {
  if(!engine || !tokenizer || !graph) throw new Error('Load a model and a valid graph before sending a message.');
  if(!r.text.trim() || r.text.length>16000) throw new Error('Enter a question under 16,000 characters.');
  let found: Retrieval=JSON.parse(graph.retrieve(r.text,JSON.stringify(previous),r.event?JSON.stringify(r.event):''));
  if(!r.retrieval) found={...found,facts:[]};
  const bounded=boundPrompt(system,history,r.text,found,s=>tokenizer!.encode(s));
  send({type:'evidence',id:r.id,retrieval:bounded.retrieval,inputTokens:bounded.ids.length,droppedTurns:bounded.droppedTurns});
  engine.reset(); engine.set_rng_seed(42);
  const started=performance.now(); let first: number|null=null, text='', gpuDecodeVerified=false;
  await engine.begin_stream_with_params_async(bounded.ids,256,0,1,0,1,0);
  const output: number[]=[];
  for(let i=0;i<256;i++) {
    await tick(); if(cancelled) {engine.stop_stream();break;}
    const token=await engine.next_token_async(); if(token===undefined) break;
    if(first===null) {
      first=performance.now()-started;
      const logits=engine.last_logits;
      if(!logits.length || !logits.every(Number.isFinite) || !logits.some(x=>x!==0)) throw new Error('The runtime produced invalid logits. Reload the model or choose CPU; GPU capability detection alone is not a correctness check.');
      const info=JSON.parse(engine.backend_info());
      gpuDecodeVerified=info.backend==='webgpu' && info.has_gpu_weights && info.has_gpu_kv_cache;
    }
    output.push(token);text=tokenizer.decode(new Uint32Array(output));
    send({type:'chunk',id:r.id,text});
  }
  const total=performance.now()-started;
  if(!cancelled && text) {history=[...bounded.kept,{role:'user',content:r.text},{role:'assistant',content:text}];previous=found.entityIds;}
  send({type:'complete',id:r.id,text,metrics:{inputTokens:bounded.ids.length,outputTokens:output.length,firstTokenMs:first,totalMs:total,tokensPerSecond:output.length>1?(output.length-1)/((total-(first??0))/1000):0,droppedTurns:bounded.droppedTurns,droppedFacts:bounded.droppedFacts,backend:JSON.parse(engine.backend_info()),gpuDecodeVerified,wasmMemoryBytes:wasm.memory.buffer.byteLength,modelBytes:manifest.files.weights.bytes,stopReason:cancelled?'cancelled':engine.stream_stop_reason}});
}
self.onmessage=async ({data:r}:MessageEvent<Request>)=>{
  if(r.type==='cancel') { if(r.id===active) cancelled=true; return; }
  if(busy) {send({type:'error',id:r.id,message:'Wait for the current operation or press Stop.',fatal:false});return;}
  busy=true;active=r.id;cancelled=false;diagnostic='';
  try {
    switch(r.type) {
      case 'init': await initialize(r);break;
      case 'graph': {
        if(!graphClass) throw new Error('Load the model before importing a graph.');
        const candidate=new graphClass(r.json); graph?.free();graph=candidate;history=[];previous=[];
        send({type:'graph',id:r.id,summary:JSON.parse(graph.summary())}); break;
      }
      case 'generate': await generate(r);break;
      case 'reset': engine?.reset();history=[];previous=[];send({type:'reset',id:r.id});break;
    }
  } catch(error) {
    const fatal = r.type==='init' || error instanceof WebAssembly.RuntimeError || /invalid logits/i.test(String(error));
    send({type:'error',id:r.id,message:String(error)+(fatal&&diagnostic?' '+diagnostic:'')+(fatal?' Reload the model to retry. If WebGPU fails, select CPU / WASM.':''),fatal});
  } finally {busy=false;active='';}
};
