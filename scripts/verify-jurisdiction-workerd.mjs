// Optional live Edge compatibility check. Requires workerd on PATH or WORKERD_BIN.
// Only the fixed public NYS service is contacted; no model or credentials are used.
import {buildSync} from 'esbuild'
import {execFileSync,spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {mkdtempSync,writeFileSync,rmSync,existsSync,mkdirSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {resolve,dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {selectedLocationFromFeature} from '../src/data/selectedLocation.js'
const root=fileURLToPath(new URL('../',import.meta.url)),binary=process.env.WORKERD_BIN||'workerd'
const output=process.argv[2]?resolve(process.argv[2]):null
if(output&&existsSync(output))throw Error('Capture already exists; choose a new output JSON path.')
const runtime=execFileSync(binary,['--version'],{encoding:'utf8'}).trim()
const baseline='2c1186391bec4fac98febf8b473d00e7d3431e45'
const original=execFileSync('git',['show',baseline+':src/data/jurisdictionLookup.js'],{cwd:root,encoding:'utf8'})
const before=buildSync({stdin:{contents:original,resolveDir:join(root,'src/data'),sourcefile:'original.js'},bundle:true,write:false,format:'iife',globalName:'Original'}).outputFiles[0].text
const after=buildSync({entryPoints:[join(root,'src/data/jurisdictionLookup.js')],bundle:true,write:false,format:'iife',globalName:'Patched'}).outputFiles[0].text
const cases=[
 {case:'kfrg',expected:['County: Suffolk','Town: Babylon'],location:selectedLocationFromFeature({name:'KFRG — Republic Airport',station_id:'KFRG',geometry:{type:'Point',coordinates:[-73.4134,40.7288]}})},
 {case:'brentwood_shelter',expected:['County: Suffolk','Town: Islip'],location:selectedLocationFromFeature({name:'Brentwood HS',geometry:{type:'Point',coordinates:[-73.246,40.7776]}})}
]
const port=await new Promise((resolvePort,reject)=>{
 const server=createServer();server.once('error',reject)
 server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolvePort(value))})
})
const temp=mkdtempSync(join(tmpdir(),'openember-edge-lookup-'))
const worker=before+'\n'+after+'\n'+`export default {async fetch(){const records=[];for(const sample of ${JSON.stringify(cases)})for(const [version,api]of [['original',Original],['patched',Patched]]){const question='Tell me about emergency considerations for '+sample.location.display_name+' — '+sample.location.description;const start=Date.now();const result=await api.lookupJurisdiction(sample.location,question,{onFailure:()=>{}});records.push({case:sample.case,version,elapsed_ms:Date.now()-start,status:result.status,names:result.names,levels:result.levels.map(({level,status,reason,failure_stage,failure_code})=>({level,status,reason,failure_stage,failure_code}))})}return Response.json({records})}}`
writeFileSync(join(temp,'worker.mjs'),worker)
writeFileSync(join(temp,'config.capnp'),`using Workerd = import "/workerd/workerd.capnp";\nconst config :Workerd.Config = (services=[(name="main",worker=(modules=[(name="worker.mjs",esModule=embed "worker.mjs")],compatibilityDate="2026-11-15")),(name="internet",network=(allow=["public"],tlsOptions=(trustBrowserCas=true)))],sockets=[(name="http",address="127.0.0.1:${port}",http=(),service="main")]);`)
const child=spawn(binary,['serve',join(temp,'config.capnp')],{stdio:['ignore','ignore','pipe']})
let startupError=null
child.on('error',error=>{startupError=error})
// Do not print raw runtime stderr, which can contain request or environment data.
child.stderr.resume()
try {
 let response
 for(let i=0;i<40;i++) {
  if(startupError)throw startupError
  try{response=await fetch(`http://127.0.0.1:${port}`,{signal:AbortSignal.timeout(30000)});break}
  catch(error){if(child.exitCode!==null||i===39)throw error;await new Promise(resolveWait=>setTimeout(resolveWait,100))}
 }
 const result={runtime,baseline,captured_at:new Date().toISOString(),provenance:'Local workerd running original committed and current lookup bundles against live public NYS data; no cloud model calls.',...await response.json()}
 for(const sample of cases) {
  const record=result.records.find(r=>r.case===sample.case&&r.version==='patched')
  if(record?.status!=='matched'||JSON.stringify(record.names)!==JSON.stringify(sample.expected))throw Error('Patched runtime lookup failed for '+sample.case)
 }
 if(output){mkdirSync(dirname(output),{recursive:true});writeFileSync(output,JSON.stringify(result,null,2)+'\n')}
 console.log(JSON.stringify(result,null,2))
}finally {child.kill();await new Promise(done=>{if(!child.pid||child.exitCode!==null)done();else child.once('exit',done)});rmSync(temp,{recursive:true,force:true})}
