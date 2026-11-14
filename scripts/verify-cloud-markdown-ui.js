// Run against a local dev server only, through playwright-cli run-code --filename.
// Deterministic presentation fixture; this is not hosted/model answer acceptance.
async (page) => {
  if(!['127.0.0.1','localhost'].includes(new URL(page.url()).hostname))throw Error('Local preview required');
  await page.reload();
  await page.evaluate(() => {
    const actualFetch=window.fetch;
    window.fixtureChatCalls=[];
    window.fetch=async (url,options={}) => {
      if(!String(url).endsWith('/api/chat'))return actualFetch(url,options);
      window.fixtureChatCalls.push(JSON.parse(options.body));
      const tokens=['## Facts\n\n- Measured **8°C**.\n\n','| Source | Valid time | Coverage | Long field |\n| --- | --- | --- | --- |\n| [NWS](https://api.weather.gov/) | 2026-11-14T14:50:00Z | partial | '+ 'Wide-column-content-'.repeat(20)+' |\n\n','## Gaps\n\n![Remote](https://example.invalid/tracker.png)\n\n<script>window.markdownExecuted=true</script>\n\n[Unsafe](javascript:alert(1))\n\n','## Suggestions\n\n- Consult the applicable SOP.\n'];
      let timer;
      const stream=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify({ember_scope:{request_utc:'2026-11-14T15:00:00Z',timezone:'America/New_York',status:'resolved',method:'fixture'}})+'\n'));let i=0;const send=()=>{if(options.signal?.aborted){controller.error(new DOMException('Aborted','AbortError'));return}controller.enqueue(new TextEncoder().encode(JSON.stringify({message:{content:tokens[i++]}})+'\n'));if(i<tokens.length)timer=setTimeout(send,1800);else controller.close()};timer=setTimeout(send,100);options.signal?.addEventListener('abort',()=>{clearTimeout(timer);controller.error(new DOMException('Aborted','AbortError'))},{once:true})},cancel(){clearTimeout(timer)}});
      return new Response(stream,{headers:{'Content-Type':'application/x-ndjson'}});
    };
  });
  await page.getByRole('textbox',{name:'Incident type + location… e.g'}).fill('Show the supplied plan facts.');
  await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.getByRole('heading',{name:'Facts',exact:true}).last().waitFor();
  const progressive={factsVisible:await page.getByRole('heading',{name:'Facts',exact:true}).count(),suggestionsVisible:await page.getByRole('heading',{name:'Suggestions',exact:true}).count(),stopVisible:await page.getByRole('button',{name:/STOP/}).count()};
  await page.getByRole('heading',{name:'Suggestions',exact:true}).last().waitFor();
  const checks=await page.evaluate(()=>{
    const tables=[...document.querySelectorAll('.answer-table')],links=[...document.querySelectorAll('.assistant-markdown a')];
    return {tables:tables.length,tableScrollable:tables.some(t=>t.scrollWidth>t.clientWidth),remoteImages:document.querySelectorAll('.assistant-markdown img').length,unsafeLinks:links.filter(a=>a.href.startsWith('javascript:')).length,safeLinks:links.every(a=>a.rel.includes('noopener')),htmlExecuted:!!window.markdownExecuted,fixtureCalls:window.fixtureChatCalls.length,metadata:document.body.textContent.includes('Application request scope')};
  });
  await page.screenshot({path:'output/playwright/cloud-slice-markdown.png',fullPage:true});
  if(!progressive.factsVisible||progressive.suggestionsVisible||!progressive.stopVisible||checks.tables!==1||!checks.tableScrollable||checks.remoteImages||checks.unsafeLinks||checks.htmlExecuted||checks.fixtureCalls!==1||!checks.metadata)throw Error(JSON.stringify({progressive,checks}));
  await page.getByRole('textbox',{name:'Incident type + location… e.g'}).fill('Stop fixture response');
  const previous=await page.getByRole('heading',{name:'Facts',exact:true}).count();
  await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.waitForFunction(n=>document.querySelectorAll('.assistant-markdown h2').length>n,await page.locator('.assistant-markdown h2').count());
  await page.getByRole('button',{name:/STOP/}).click();
  const stop={facts:await page.getByRole('heading',{name:'Facts',exact:true}).count(),sendVisible:await page.getByRole('button',{name:'▶ SEND',exact:true}).isVisible(),calls:await page.evaluate(()=>window.fixtureChatCalls.length),retainedSuggestions:await page.getByRole('heading',{name:'Suggestions',exact:true}).count()};
  if(stop.facts!==previous+1||!stop.sendVisible||stop.calls!==2||stop.retainedSuggestions!==1)throw Error(JSON.stringify(stop));
  await page.screenshot({path:'output/playwright/cloud-slice-stop.png',fullPage:true});
  return {progressive,checks,stop};
}
