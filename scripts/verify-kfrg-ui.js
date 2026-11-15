// Actual marker -> Send to Chat and exact typed regression. Fixed public fixture; no cloud calls.
async(page)=>{
 if(new URL(page.url()).hostname!=='127.0.0.1')throw Error('Local browser required')
 await page.route('https://**',route=>route.fulfill({status:503,body:'{}',contentType:'application/json'}))
 await page.addInitScript(()=>{
  sessionStorage.removeItem('ember_ollama_key')
  const OriginalDate=Date,clock=OriginalDate.parse('2026-11-15T14:43:14Z')
  window.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[clock]))}static now(){return clock}}
  const actual=window.fetch;window.kfrgRequests=[]
  window.fetch=(url,options)=>{
   const key=String(url)
   if(key==='/api/chat'){window.kfrgRequests.push(JSON.parse(options.body));return actual('http://127.0.0.1:5182/api/chat',options)}
   if(key==='https://api.weather.gov/stations/KFRG/observations/latest')return actual('http://127.0.0.1:5182/_fixture/sources/nws_obs_kfrg',{signal:options?.signal})
   if(key.startsWith('https://'))return Promise.resolve(new Response('{}',{status:503,headers:{'content-type':'application/json'}}))
   return actual(url,options)
  }
 })
 await page.reload()
 await page.getByRole('textbox',{name:'sk-...'}).fill('recording-only');await page.getByRole('button',{name:'Save',exact:true}).click()
 const input=page.getByRole('textbox',{name:'Incident type + location… e.g'})
 const prompt='what is the most recent weather observations for KFRG?'
 await input.fill(prompt);await page.getByRole('button',{name:'▶ SEND',exact:true}).click()
 await page.locator('.assistant-markdown').last().filter({hasText:'KFRG'}).waitFor()
 await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor()
 const typed=await page.locator('.assistant-markdown').last().innerText()
 if(!typed.includes('20.92 km/h')||!typed.includes('14:30:00')||typed.includes('Incomplete answer'))throw Error('Typed readout failed: '+typed)
 const marker=page.locator('.leaflet-marker-icon').filter({hasText:'13g18mph'})
 await marker.click()
 await page.getByRole('button',{name:'Send to Chat',exact:true}).click()
 await page.waitForFunction(()=>[...document.querySelectorAll('.assistant-markdown')].at(-1)?.textContent.includes('airport operating status'))
 await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor()
 const map=await page.locator('.assistant-markdown').last().innerText()
 for(const text of ['KFRG','20.92 km/h','28.96 km/h','300 degrees','14:30:00','airport operating status'])if(!map.includes(text))throw Error('Map handoff lost '+text+': '+map)
 for(const text of ['evacuation ANY','Heat Index','No eligible weather values','KJFK'])if(map.includes(text))throw Error('Unrelated or empty answer: '+text)
 const raw=page.locator('.request-sources').last()
 if(await raw.locator('pre').isVisible())throw Error('Raw sources expanded')
 await raw.locator('summary').click()
 if(!(await raw.locator('pre').innerText()).includes('SELECTED MAP OBSERVATION'))throw Error('Map source unavailable')
 await raw.locator('summary').click()
 const metadata=(await page.locator('.answer-provenance pre').allTextContents()).map(JSON.parse)
 if(metadata.length!==2||metadata.some(s=>s.enforcement.status!=='deterministic_observation'||s.observation_selection.stations.join(',')!=='KFRG'))throw Error('Readout metadata lost')
 const requests=await page.evaluate(()=>window.kfrgRequests)
 if(requests.length!==2||requests[1].scope_input.selection.station_id!=='KFRG')throw Error('Structured selection missing')
 const selected=requests[1].scope_input.weather.filter(s=>s.id==='nws_obs_kfrg')
 if(selected.length!==1||selected[0].data.properties.windDirection.value!==300)throw Error('Source payload lost or duplicated')
 const stats=await(await page.request.get('http://127.0.0.1:5182/_fixture/stats')).json()
 if(stats.calls!==0)throw Error('Simple readout invoked provider')
 await page.evaluate(x=>window.kfrgResults=x,{typed:{prompt,answer:typed,request:requests[0]},map:{answer:map,request:requests[1]},providerCalls:stats.calls,metadata:metadata,provenance:'Fixed-clock local browser, full NWS-shaped fixture, actual marker click and Edge handler. No cloud generations; not hosted acceptance.'})
 await page.screenshot({path:'output/playwright/kfrg-map-to-chat.png',fullPage:true})
 return {typed:true,mapClickToChat:true,sourceProvenance:true,stationIsolation:true,rawCollapsed:true,providerCalls:stats.calls,cloudCalls:0}
}
