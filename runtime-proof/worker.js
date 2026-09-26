const prompts = [
  'What is the capital of France? Answer in one short sentence.',
  'Facts: The research station is named Aster. Its director is Mira Vale. Who is the director of Aster?',
  'Complete the sequence: one, two, three,',
  'What is 2 + 3? Answer only with the number.',
  'Facts: The oxygen sensor is in Room R-12. Where is the oxygen sensor?',
  'Facts: The station has 17 spare filters. How many spare filters are there?',
  'Facts: Dr. Elena Ortiz leads the Ocean team. Who leads the Ocean team?',
  'Facts: The café opens at 08:30. When does the café open?',
];
const requiredAnswers=['paris','mira vale','four','5','r-12','17','elena ortiz','08:30'];
// Worker console messages are not exposed by every browser automation client.
// Preserve Rust panic/validation diagnostics in the visible proof evidence.
const originalConsoleError=console.error.bind(console);
console.error=(...args)=>{
  postMessage({kind:'diagnostic',message:args.map(String).join(' ')});
  originalConsoleError(...args);
};
const progress=(message,percent)=>postMessage({kind:'progress',message,percent});
async function reference(path, body) {
  const r=await fetch('/reference/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(150000)});
  if(!r.ok) {
    const error=await r.json().catch(()=>({error:'HTTP '+r.status}));
    throw new Error('Reference '+path+': '+error.error);
  }
  return r.json();
}
async function localFile(path) {
  const response=await fetch(path,{signal:AbortSignal.timeout(120000)});
  if(!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}). Run npm run setup:assets and npm run proof:build, then retry.`);
  return response;
}
async function modelBytes() {
  const response=await localFile('/.cache/models/smollm2-360m-instruct-q8_0.gguf');
  const total=Number(response.headers.get('Content-Length'));
  if(!Number.isSafeInteger(total)||total<=0) throw new Error('The model server did not provide a valid file size. Use npm run dev to serve the model.');
  const bytes=new Uint8Array(total), reader=response.body.getReader();
  let loaded=0,lastPercent=-1;
  while(true) {
    const {done,value}=await reader.read();
    if(done)break;
    if(loaded+value.length>total) throw new Error('Model size changed during loading. Run npm run setup:assets, then retry.');
    bytes.set(value,loaded);loaded+=value.length;
    const percent=Math.floor(loaded/total*100);
    if(percent!==lastPercent){progress(`Loading local model: ${(loaded/1e6).toFixed(0)} / ${(total/1e6).toFixed(0)} MB (${percent}%)`,percent);lastPercent=percent;}
  }
  if(loaded!==total) throw new Error('Model transfer was incomplete. Restart npm run dev and retry.');
  return bytes;
}
self.onmessage=async ({data:{backend='gpu',mode='async',tokenizerMode='external'}})=>{
  const result={kind:'result',requestedBackend:backend,mode,tokenizerMode,cases:[]};
  let engine,tokenizer;
  try {
    if(!['gpu','cpu'].includes(backend)||!['async','healed'].includes(mode)||!['embedded','external','reference'].includes(tokenizerMode)) throw new Error('Invalid diagnostic options. Open http://127.0.0.1:8787/ without query parameters and retry.');
    progress('Loading the Rust/WASM runtime');
    const {default:init,FlareEngine,FlareTokenizer}=await import('/.cache/flare-pkg/flare_web.js').catch(error=>{
      throw new Error('The Flare JavaScript module could not load. Run npm run proof:build, then retry. '+error.message);
    });
    await init().catch(error=>{
      throw new Error('The WASM runtime could not load or initialize. Run npm run proof:build, keep npm run dev running, then reload this page. '+error.message);
    });
    progress('Loading the original SmolLM2 tokenizer');
    tokenizer=FlareTokenizer.from_json(await (await localFile('/.cache/models/tokenizer.json')).text());
    const bytes=await modelBytes();
    progress('Parsing the model weights in WASM');
    const loadStart=performance.now();
    engine=FlareEngine.load(bytes);
    result.loadMs=performance.now()-loadStart;
    result.modelBytes=bytes.length;
    if(backend==='gpu') {
      progress('Requesting WebGPU and uploading model weights');
      if(!navigator.gpu) throw new Error('WebGPU is unavailable in this worker. Use desktop Chrome with graphics acceleration enabled, or run the CPU diagnostic.');
      result.gpuInitialized=await engine.init_gpu();
      if(!result.gpuInitialized) throw new Error('WebGPU initialization failed. Check Chrome graphics acceleration, close other GPU-heavy tabs, and retry. The CPU diagnostic is also available.');
    }
    result.backend=JSON.parse(engine.backend_info());
    result.template=engine.chat_template_name;
    result.addBosToken=engine.add_bos_token;
    result.eos=engine.eos_token_id;
    for(const user of prompts) {
      progress(`Prompt ${result.cases.length+1}/${prompts.length}: checking tokens and the local reference`);
      engine.reset();
      const system='You are a helpful assistant. Answer briefly.';
      const prompt=engine.apply_chat_template(user,system);
      const refTokens=(await reference('tokenize',{content:prompt,add_special:false,parse_special:true})).tokens;
      const embeddedTokens=Array.from(engine.encode_text(prompt));
      const externalTokens=Array.from(tokenizer.encode(prompt));
      const inputTokens=tokenizerMode==='reference'?refTokens:tokenizerMode==='external'?externalTokens:embeddedTokens;
      if(inputTokens.length+32>2048) throw new Error('The diagnostic exceeds the 2048-token context budget.');
      const refTemplate=await reference('apply-template',{messages:[{role:'system',content:system},{role:'user',content:user}],add_generation_prompt:true});
      const ref=await reference('completion',{prompt,n_predict:32,temperature:0,seed:42,cache_prompt:false,return_tokens:true});
      const item={user,prompt,inputTokens,referenceTokens:refTokens,externalTokens,tokenizerMatches:JSON.stringify(inputTokens)===JSON.stringify(refTokens),templateMatches:prompt===refTemplate.prompt,referenceText:ref.content,referenceOutputTokens:ref.tokens};
      progress(`Prompt ${result.cases.length+1}/${prompts.length}: running Flare ${backend.toUpperCase()} prefill and decoding`);
      const start=performance.now();
      if(mode==='healed') engine.begin_stream_healed_with_params(new Uint32Array(inputTokens),32,0,1,0,1,0);
      else await engine.begin_stream_with_params_async(new Uint32Array(inputTokens),32,0,1,0,1,0);
      item.prefillMs=performance.now()-start;
      item.outputTokens=[];item.output='';
      for(let i=0;i<32;i++) {
        const id=await engine.next_token_async();
        if(id===undefined)break;
        if(i===0){
          item.firstTokenMs=performance.now()-start;
          const logits=engine.last_logits;
          item.firstLogits={count:logits.length,finite:0,nonzero:0,min:null,max:null};
          for(const value of logits){if(Number.isFinite(value)){item.firstLogits.finite++;if(value!==0)item.firstLogits.nonzero++;item.firstLogits.min=item.firstLogits.min===null?value:Math.min(item.firstLogits.min,value);item.firstLogits.max=item.firstLogits.max===null?value:Math.max(item.firstLogits.max,value);}}
        }
        item.outputTokens.push(id);
        const decoded=tokenizer.decode(new Uint32Array(item.outputTokens));
        const text=decoded.slice(item.output.length); item.output=decoded;
        postMessage({kind:'token',text});
      }
      item.totalMs=performance.now()-start;
      item.referenceTextMatches=item.output===item.referenceText;
      // llama.cpp includes its terminal EOS; Flare signals EOS with undefined.
      const comparableReference=item.referenceOutputTokens.at(-1)===engine.eos_token_id
        ?item.referenceOutputTokens.slice(0,-1):item.referenceOutputTokens;
      item.referenceOutputTokensMatch=JSON.stringify(item.outputTokens)===JSON.stringify(comparableReference);
      item.smokePassed=item.output.toLowerCase().includes(requiredAnswers[result.cases.length]);
      item.backendAfter=JSON.parse(engine.backend_info());
      item.metrics=JSON.parse(engine.performance_summary());
      result.cases.push(item);
    }
    result.gatePassed=result.cases.length===prompts.length && result.cases.every(c=>c.tokenizerMatches&&c.templateMatches&&c.smokePassed&&c.referenceTextMatches&&c.referenceOutputTokensMatch&&c.firstLogits?.nonzero>0) && (backend!=='gpu'||(result.backend.backend==='webgpu'&&result.backend.has_gpu_weights&&result.backend.has_gpu_kv_cache));
    postMessage(result);
  }catch(e){postMessage({...result,kind:'error',message:String(e),stack:e.stack});}
  finally {engine?.free();tokenizer?.free();}
};
