// Run after KFRG map -> Send to Chat, then an unrelated typed observation query.
async page=>{
 if(new URL(page.url()).hostname!=='127.0.0.1')throw Error('Local recording browser required')
 const answers=(await page.getByRole('group',{name:'Chat message from assistant',exact:true}).allInnerTexts()).slice(-2)
 if(answers.length!==2||!answers[0].includes('Suffolk OEM telephone')||!answers[0].includes('Conditional considerations'))throw Error('Map answer lost supported interpretation')
 if(answers[1].includes('Selected map location:')||answers[1].includes('county coordination reference'))throw Error('Selected-location context leaked into typed answer')
 const raw=page.getByText('Request sources (raw)',{exact:true}).first()
 const sources=page.locator('pre').filter({hasText:'SELECTED MAP LOCATION'}).first()
 if(await sources.isVisible())throw Error('Raw sources must begin collapsed')
 await raw.click();await sources.waitFor()
 const fullSource=await sources.innerText()
 if(!fullSource.includes('SELECTED MAP LOCATION')||!fullSource.includes('Contacts & Resources'))throw Error('Full raw context missing')
 await raw.click()
 await page.screenshot({path:'output/playwright/live-synthesis-streamlit.png',fullPage:true})
 const result={checks:{kfrgMapToChat:true,usefulInterpretation:true,rawCollapsed:true,fullSourceInspection:true,noVisibleTypedCarryover:true},answers,fullSource,cloudCalls:0,provenance:'Local recording provider with synthetic relative-clock observations; not hosted acceptance.'}
 await page.evaluate(value=>window.liveStreamlitBrowserResults=value,result)
 return {checks:result.checks,cloudCalls:0}
}
