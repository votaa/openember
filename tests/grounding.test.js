import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {COPILOT_RULES,buildCopilotSystemPrompt} from '../src/data/copilotPrompt.js'
import {scopedCloudMessages} from '../src/data/cloudRequestScope.js'
import handler from '../api/chat.js'
const fixture=JSON.parse(readFileSync(new URL('../shared/grounding-regressions.json',import.meta.url)))
const captured=JSON.parse(readFileSync(new URL('../'+fixture.input_capture,import.meta.url)))

// Checks evidence and contract delivery, never claims that a model answer passes.
test('both runtime prompts carry every reported failure rule and preserve conditional analysis',()=>{
 const python=execFileSync('python3',['-c','import sys;sys.path.insert(0,"streamlit");from copilot_prompt import COPILOT_RULES;print(COPILOT_RULES)'],{encoding:'utf8'}).trim()
 assert.equal(COPILOT_RULES,python)
 const prompt=buildCopilotSystemPrompt('Long Island','explicitly supplied SOP and asset specifications')
 for(const c of fixture.cases)assert.ok(prompt.includes(c.required_rule),c.id)
 assert.ok(prompt.includes(fixture.conditional_analysis))
 assert.ok(prompt.includes(fixture.positive_evidence_rule))
 assert.ok(prompt.includes('a later caveat does not repair an earlier unsupported claim'))
})

test('same captured mixed-source request retains full evidence, resolved night and final authoritative rules',()=>{
 const body=structuredClone(captured),before=structuredClone(body)
 assert.equal(body.messages.at(-1).content,fixture.question)
 const out=scopedCloudMessages(body,fixture.requested_at)
 assert.deepEqual(body,before)
 assert.equal(out.scope.status,'resolved')
 assert.equal(out.scope.interval.start_utc,'2026-11-14T23:00:00Z')
 assert.equal(out.scope.interval.end_utc,'2026-11-15T11:00:00Z')
 const prompt=out.messages[0].content
 assert.ok(prompt.endsWith('AUTHORITATIVE GROUNDING RULES: '+COPILOT_RULES))
 assert.ok(prompt.includes(body.messages[0].content))
 for(const upload of body.uploads)assert.ok(prompt.includes(upload.content))
 for(const fact of ['CEDAR-731','47 amber cones','DELTA-19','no incident commander is specified'])assert.ok(prompt.includes(fact))
 for(const c of fixture.cases)assert.ok(prompt.includes(c.required_rule),c.id)
})

test('actual Edge proxy delivers strengthened rules and whole uploaded plan to a recording provider',async()=>{
 const original=globalThis.fetch,calls=[]
 globalThis.fetch=async(url,options)=>{calls.push(JSON.parse(options.body));return new Response('{"message":{"content":"recording provider, not model acceptance"},"done":true}\n')}
 try{
  const response=await handler(new Request('http://localhost/api/chat',{method:'POST',headers:{'content-type':'application/json','x-ollama-key':'recording-only-key'},body:JSON.stringify(captured)}))
  assert.equal(response.status,200);assert.match(await response.text(),/recording provider/)
  assert.equal(calls.length,1)
  const prompt=calls[0].messages[0].content
  assert.ok(prompt.endsWith('AUTHORITATIVE GROUNDING RULES: '+COPILOT_RULES))
  for(const c of fixture.cases)assert.ok(prompt.includes(c.required_rule),c.id)
  for(const upload of captured.uploads)assert.ok(prompt.includes(upload.content))
  assert.equal(calls[0].messages.at(-1).content,fixture.question)
 }finally{globalThis.fetch=original}
})
