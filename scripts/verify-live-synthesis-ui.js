// Run after hospital and KFRG marker -> Send to Chat in the local fixture browser.
async page=>{
 if(new URL(page.url()).hostname!=='127.0.0.1')throw Error('Local recording browser required')
 const prior=(await page.locator('.assistant-markdown').allInnerTexts()).slice(-2)
 if(!prior[0].includes('North Shore University Hospital in its Nassau hospital section')||!prior[1].includes('4030 seconds old')||!prior[1].includes('Suffolk OEM telephone'))throw Error('Map assessments lost useful source facts')
 for(const a of prior)if(a.includes('mandatory evacuation ANY')||a.includes('"statements"'))throw Error('Unvalidated text displayed')
 const before=(await page.locator('.answer-provenance pre').allTextContents()).map(JSON.parse)
 if(before.length!==2||before.some(s=>s.enforcement.route!=='location_synthesis'||s.synthesis.validation.format!=='valid'))throw Error('Synthesis history metadata missing')
 const raw=page.locator('.request-sources').last()
 if(await raw.locator('pre').isVisible())throw Error('Raw sources must start collapsed')
 await raw.locator('summary').click()
 if(!(await raw.locator('pre').innerText()).includes('SELECTED MAP LOCATION'))throw Error('Full source snapshot missing')
 await raw.locator('summary').click()
 await page.getByRole('textbox',{name:/Incident type/}).fill('What are the most recent observations for KFRG?')
 await page.getByRole('button',{name:'▶ SEND',exact:true}).click()
 await page.waitForFunction(()=>window.liveSynthesisRequests.length===3)
 await page.getByRole('button',{name:'▶ SEND',exact:true}).waitFor()
 const scopes=(await page.locator('.answer-provenance pre').allTextContents()).map(JSON.parse)
 if(scopes.length!==3||scopes[2].selected_location||scopes[2].synthesis||scopes[2].enforcement.route!=='bounded_query_records')throw Error('Selection or synthesis leaked into unrelated question')
 if(JSON.stringify(scopes.slice(0,2))!==JSON.stringify(before))throw Error('Earlier validation or scope changed')
 const stats=await(await page.request.get('http://127.0.0.1:5186/_fixture/stats')).json()
 const result={checks:{hospitalMapToChat:true,kfrgMapToChat:true,retainedValidation:true,rawCollapsed:true,fullSourceInspection:true,noTypedCarryover:true},answers:(await page.locator('.assistant-markdown').allInnerTexts()).slice(-3),scopes,requests:await page.evaluate(()=>window.liveSynthesisRequests),recording:stats,cloudCalls:0,provenance:'Frozen local sources and recording provider; no live model reasoning or hosted acceptance.'}
 await page.evaluate(r=>window.liveSynthesisBrowserResults=r,result)
 await page.screenshot({path:'output/playwright/live-synthesis-react.png',fullPage:true})
 return {checks:result.checks,providerCalls:stats.providerCalls,cloudCalls:0}
}
