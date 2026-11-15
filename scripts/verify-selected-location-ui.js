// Run after verify-kfrg-ui.js against the local recording provider. No cloud calls.
async page => {
 if(new URL(page.url()).hostname!=='127.0.0.1')throw Error('Local browser required')
 const previous=await page.evaluate(()=>window.kfrgResults)
 const selected=previous.map.request.scope_input.selected_location
 if(selected.station_id!=='KFRG'||selected.geometry.type!=='Point')throw Error('Station location contract missing')
 const retained=previous.metadata[1].selected_location
 if(JSON.stringify(retained.location)!==JSON.stringify(selected))throw Error('Retained station location differs from request')
 await page.locator('.leaflet-marker-icon').filter({hasText:'🏥'}).first().click()
 await page.getByRole('button',{name:'Send to Chat',exact:true}).click()
 await page.waitForFunction(()=>window.kfrgRequests.length===3)
 await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor()
 const hospital=await page.evaluate(()=>window.kfrgRequests[2])
 const location=hospital.scope_input.selected_location
 if(location.source_id!=='hospitals'||location.geometry.type!=='Point'||location.station_id!==null||hospital.scope_input.selection)throw Error('Hospital identity contaminated by station selection')
 const answer=await page.locator('.assistant-markdown').last().innerText()
 if(!answer.includes(location.display_name)||!answer.includes('Local jurisdiction and facility footprint are unresolved'))throw Error('Hospital identity or uncertainty missing')
 const input=page.getByRole('textbox',{name:'Incident type + location… e.g'})
 await input.fill('What are the most recent observations for KFRG?')
 await page.getByRole('button',{name:'▶ SEND',exact:true}).click()
 await page.waitForFunction(()=>window.kfrgRequests.length===4)
 await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor()
 const typed=await page.evaluate(()=>window.kfrgRequests[3])
 if(typed.scope_input.selected_location||typed.scope_input.selection)throw Error('Map selection leaked into unrelated typed question')
 const metadata=(await page.locator('.answer-provenance pre').allTextContents()).map(JSON.parse)
 if(metadata.length!==4||metadata[3].selected_location||metadata[2].selected_location.location.display_name!==location.display_name||metadata[1].selected_location.location.station_id!=='KFRG')throw Error('History metadata changed or leaked')
 const raw=page.locator('.request-sources').nth(2)
 if(await raw.locator('pre').isVisible())throw Error('Hospital sources must start collapsed')
 await raw.locator('summary').click()
 if(!(await raw.locator('pre').innerText()).includes('SELECTED MAP LOCATION'))throw Error('Location source snapshot missing from history')
 await raw.locator('summary').click()
 const stats=await(await page.request.get('http://127.0.0.1:5182/_fixture/stats')).json()
 const result={station:selected,hospital:location,hospitalAnswer:answer,retainedScopes:metadata,checks:{stationMapToChat:true,hospitalMapToChat:true,noTypedCarryover:true,rawCollapsed:true,historyPreserved:true},providerCalls:stats.calls,cloudCalls:0,provenance:'Fixed-clock local recording provider; transport and rendering only. Hosted acceptance remains open.'}
 await page.evaluate(value=>window.selectedLocationResults=value,result)
 await page.screenshot({path:'output/playwright/selected-location-batch1.png',fullPage:true})
 return result
}
