async (page) => {
  if(new URL(page.url()).hostname!=='127.0.0.1')throw Error('Local browser required');
  const sources={"https://api.weather.gov/gridpoints/OKX/62,50/forecast": {"properties": {"periods": [{"startTime": "2026-11-14T23:00:00Z", "endTime": "2026-11-15T11:00:00Z", "temperature": 34, "temperatureUnit": "F", "name": "Tonight", "isDaytime": false}, {"startTime": "2026-11-15T11:00:00Z", "endTime": "2026-11-16T11:00:00Z", "temperature": 42, "temperatureUnit": "F", "name": "Tomorrow", "isDaytime": false}, {"startTime": "2026-11-18T11:00:00Z", "endTime": "2026-11-19T11:00:00Z", "temperature": 88, "temperatureUnit": "F", "name": "Later", "isDaytime": false}]}}, "https://api.weather.gov/gridpoints/OKX/62,50/forecast/hourly": {"properties": {"periods": [{"startTime": "2026-11-14T15:00:00Z", "endTime": "2026-11-15T15:00:00Z", "temperature": 36, "temperatureUnit": "F", "name": "", "isDaytime": false}, {"startTime": "2026-11-15T15:00:00Z", "endTime": "2026-11-16T15:00:00Z", "temperature": 99, "temperatureUnit": "F", "name": "", "isDaytime": false}]}}, "https://api.weather.gov/gridpoints/OKX/62,50": {"properties": {"windGust": {"uom": "wmoUnit:km_h-1", "values": [{"validTime": "2026-11-14T15:00:00Z/PT24H", "value": 20}, {"validTime": "2026-11-15T15:00:00Z/PT24H", "value": null}, {"validTime": "2026-11-18T15:00:00Z/PT24H", "value": 88}]}}}, "https://api.weather.gov/stations/KISP/observations/latest": {"properties": {"timestamp": "2026-11-14T14:50:00Z", "station": "KISP", "temperature": {"value": 8, "unitCode": "wmoUnit:degC"}}, "geometry": {"type": "Point", "coordinates": [-73.1, 40.8]}}};
  await page.route('https://**',route=>{
    const data=sources[route.request().url()];
    return route.fulfill({status:data?200:503,contentType:'application/json',body:JSON.stringify(data||{})});
  });
  await page.addInitScript(()=>{
    sessionStorage.removeItem("ember_ollama_key");
    const actual=window.fetch;
    window.fetch=(url,options)=>String(url)==='/api/chat'?actual('http://127.0.0.1:5182/api/chat',options):actual(url,options);
  });
  await page.reload();
  await page.getByRole('textbox',{name:'sk-...'}).fill('recording-only');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.locator('input[type=file]').setInputFiles('/private/tmp/openember-cloud-upload/tests/fixtures/corrective/positive-plan.md');
  const input=page.getByRole('textbox',{name:'Incident type + location… e.g'});
  await input.fill('Assess CEDAR-731 tonight');
  await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.getByRole('button',{name:/STOP/}).waitFor();
  await page.waitForFunction(()=>document.body.textContent.includes('awaiting_provider_envelope'));
  if(await page.getByRole('heading',{name:'Facts',exact:true}).count())throw Error('Claims shown before validation');
  await page.getByRole('heading',{name:'Facts',exact:true}).last().waitFor();
  await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor();
  const valid=await page.locator('.assistant-markdown').last().innerText();
  if(!valid.includes('Casey Example')||!valid.includes('12 amber cones deployed')||!valid.includes('Exercise command requires use DELTA-19')||valid.includes('Incomplete answer'))throw Error('Positive evidence lost: '+valid);
  await input.fill('Assess CEDAR-731 tonight reject-envelope-fixture');
  await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.getByText('⚠ Incomplete answer:',{exact:false}).last().waitFor();
  const rejected=await page.locator('.assistant-markdown').last().innerText();
  if(rejected.includes('Alert if water rises > 1 ft'))throw Error('Raw trigger leaked');
  await input.fill('Assess CEDAR-731 tonight stop-fixture');
  await page.getByRole('button',{name:'▶ SEND',exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('awaiting_provider_envelope'));
  await page.getByRole('button',{name:/STOP/}).click();
  await page.getByText('Response stopped before a validated answer was available.',{exact:false}).waitFor();
  if(await page.getByRole('heading',{name:'Facts',exact:true}).count()!==2)throw Error('History lost or canceled claims displayed');
  await page.screenshot({path:'output/playwright/corrective-boundary.png',fullPage:true});
  const result={positive:true,invalidContained:true,stopBeforeValidation:true,retainedAnswers:2,cloudCalls:0};
  return result;
}
