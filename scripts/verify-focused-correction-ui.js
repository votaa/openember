// Local fixed-clock, recording-provider check. No real cloud calls or public feed fetches.
async (page) => {
  if(new URL(page.url()).hostname!=='127.0.0.1')throw Error('Local browser required');
  await page.route('https://**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.addInitScript(()=>{
    sessionStorage.removeItem('ember_ollama_key');
    const OriginalDate=Date,clock=OriginalDate.parse('2026-11-15T14:43:14Z');
    window.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}};
    const actual=window.fetch;
    const sources={
      'https://api.weather.gov/gridpoints/OKX/62,50/forecast':'nws_forecast',
      'https://api.weather.gov/gridpoints/OKX/62,50/forecast/hourly':'nws_hourly',
      'https://api.weather.gov/gridpoints/OKX/62,50':'nws_grid',
      'https://api.weather.gov/stations/KJFK/observations/latest':'nws_obs_kjfk',
      'https://api.weather.gov/stations/KISP/observations/latest':'nws_obs_kisp',
    };
    window.fixtureFeedRequests=[];
    window.fetch=(url,options)=>{
      const key=String(url);
      if(key==='/api/chat')return actual('http://127.0.0.1:5182/api/chat',options);
      if(key.startsWith('https://')) {
        window.fixtureFeedRequests.push(key);
        return sources[key]?actual('http://127.0.0.1:5182/_fixture/sources/'+sources[key],{signal:options?.signal}):Promise.resolve(new Response('{}',{status:503,headers:{'content-type':'application/json'}}));
      }
      return actual(url,options);
    };
  });
  await page.reload();
  await page.getByRole('textbox',{name:'sk-...'}).fill('recording-only');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles('/private/tmp/openember-cloud-upload/docs/long-island/acceptance/corrective-9862a66-2026-11-15-normalized/positive-plan.md');
  const input=page.getByRole('textbox',{name:'Incident type + location… e.g'});
  const question='Using the uploaded plan, explain tonight\'s weather impacts on CEDAR-731. Include cones, commander, threshold and authorized radio procedure.';
  await input.fill(question);await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('awaiting_provider_envelope'));
  if(await page.getByRole('heading',{name:'Facts',exact:true}).count())throw Error('Claims displayed before validation');
  await page.getByRole('heading',{name:'Facts',exact:true}).waitFor();
  await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor();
  const valid=await page.locator('.assistant-markdown').last().innerText();
  for(const text of ['Casey Example','12 amber cones deployed','10 ft','Exercise command requires use DELTA-19'])if(!valid.includes(text))throw Error('Lost positive evidence: '+text);
  for(const text of ['mandatory evacuation ANY','Heat Index','Public synthetic filler'])if(valid.includes(text))throw Error('Reference bypass: '+text);
  const raw=page.locator('.request-sources').first();
  if(await raw.locator('pre').isVisible())throw Error('Raw source automatically expanded');
  await raw.locator('summary').click();
  if(!(await raw.locator('pre').innerText()).includes('mandatory evacuation ANY'))throw Error('Full source unavailable for inspection');
  await raw.locator('summary').click();
  await input.fill('Describe current measured conditions at the supplied stations.');await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.getByRole('button',{name:/STOP/}).waitFor();
  await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor();
  const current=await page.locator('.assistant-markdown').last().innerText();
  if(!current.includes('KISP')||!current.includes('KJFK')||!current.includes('8 °C')||!current.includes('10 °C'))throw Error('Regional stations omitted: '+current);
  if(!current.includes('2 of 8 configured station records selected'))throw Error('Regional coverage not disclosed');
  if(current.includes('Cone displacement')||current.includes('47 amber cones'))throw Error('Unrequested cone content');
  await input.fill(question+' reject-envelope-fixture');await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.getByText('⚠ Incomplete answer:',{exact:false}).last().waitFor();
  if((await page.locator('.assistant-markdown').last().innerText()).includes('Alert if water rises > 1 ft'))throw Error('Raw trigger leaked');
  await input.fill(question+' stop-fixture');await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('awaiting_provider_envelope'));
  await page.getByRole('button',{name:/STOP/}).click();
  await page.getByText('Response stopped before a validated answer was available.',{exact:false}).waitFor();
  if(await page.getByRole('heading',{name:'Facts',exact:true}).count()!==3)throw Error('History lost');
  const requested=await page.evaluate(()=>window.fixtureFeedRequests);
  if(!requested.some(u=>u.includes('/KFRG/'))||!requested.some(u=>u.includes('/KISP/')))throw Error('Configured station fetching not exercised');
  await page.screenshot({path:'output/playwright/focused-correction.png',fullPage:true});
  return {positiveEvidence:true,referenceBypassContained:true,rawSourcesCollapsed:true,fullSourceInspection:true,regionalStations:true,currentRelevance:true,invalidContained:true,stop:true,retainedAnswers:3,chatRequests:4,cloudCalls:0};
}
