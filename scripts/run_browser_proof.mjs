import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const backend=process.argv[2]??'gpu';
const mode=process.argv[3]??'async';
const tokenizerMode=process.argv[4]??'external';
const browser=await chromium.launch({channel:'chrome',headless:false});
try {
  const page=await browser.newPage();
  const consoleMessages=[];
  page.on('console',msg=>consoleMessages.push({type:msg.type(),text:msg.text()}));
  page.on('pageerror',error=>consoleMessages.push({type:'pageerror',text:String(error)}));
  page.on('requestfailed',request=>consoleMessages.push({type:'requestfailed',url:request.url(),error:request.failure()}));
  page.on('response',response=>consoleMessages.push({type:'response',url:response.url(),status:response.status(),headers:response.headers()}));
  await page.goto(`http://127.0.0.1:8787/runtime-proof/?mode=${mode}&tokenizer=${tokenizerMode}`);
  await page.locator('#'+backend).click();
  await page.waitForFunction(()=>document.body.dataset.done,{timeout:300000});
  const result=await page.evaluate(()=>window.proofResult);
  await mkdir('artifacts/runtime-proof',{recursive:true});
  await writeFile(`artifacts/runtime-proof/${backend}-${mode}-${tokenizerMode}.json`,JSON.stringify(result??{kind:'error',message:'Worker produced no result'},null,2)+'\n');
  await writeFile(`artifacts/runtime-proof/${backend}-${mode}-${tokenizerMode}-console.json`,JSON.stringify(consoleMessages,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
  if(!result?.gatePassed)process.exitCode=1;
} finally {await browser.close();}
