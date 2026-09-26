export async function initializeBackend(engine: {init_gpu(): Promise<boolean>}, preference:'auto'|'cpu'): Promise<string|undefined> {
  if(preference==='cpu')return;
  try {
    if(!await engine.init_gpu())return 'WebGPU is unavailable. Using local CPU inference.';
  }catch(error){return `WebGPU could not initialize. Using CPU. ${String(error)}`;}
}
