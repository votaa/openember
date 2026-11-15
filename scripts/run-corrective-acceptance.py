"""Run the predetermined hosted matrix, retaining every attempt; never prints audit credentials."""
import json,os,subprocess,sys
from pathlib import Path
session=Path(sys.argv[1]).resolve()
selected=sys.argv[2:]
matrix=json.loads((session/'matrix.json').read_text())
token=Path('/private/tmp/openember-corrective-audit-token').read_text().strip()
base=Path(__file__).resolve().parents[1]
env=dict(os.environ,PREVIEW_URL='https://openember-2dicylzwd-ember-li.vercel.app',PREVIEW_COMMIT='9862a6667b3bee0655c09b2fed317b67529b3fbf',PREVIEW_AUDIT_TOKEN=token)
if not env.get('PREVIEW_VERCEL_CLI'):raise SystemExit('Set PREVIEW_VERCEL_CLI to an authenticated Vercel CLI executable')
for row in matrix:
    if selected and row['id'] not in selected:continue
    output=Path(row['directory'])
    if (output/'run.json').exists():print(row['id']+': retained existing attempt',flush=True);continue
    case_env=dict(env,PREVIEW_QUESTION=row['question'],PREVIEW_UPLOAD=row['upload'])
    print('Starting '+row['id'],flush=True)
    try:
        result=subprocess.run(['node',str(base/'scripts/validate-hosted-preview.mjs'),str(output),'--send','--transport=vercel-cli'],cwd=base,env=case_env,text=True,capture_output=True,timeout=210)
        transcript=(result.stdout+'\n'+result.stderr).replace(token,'[REDACTED]')
        (output/'runner-output.txt').write_text(transcript)
        run=json.loads((output/'run.json').read_text()) if (output/'run.json').exists() else {}
        print(json.dumps(dict(case=row['id'],exit_code=result.returncode,http=run.get('http',{}).get('status'),observed_egress=run.get('provider_egress_observed'),models=run.get('response_models'),timing_ms=run.get('timing_ms'),error=run.get('error'))),flush=True)
    except Exception as exc:
        (output/'runner-exception.txt').write_text(str(exc).replace(token,'[REDACTED]'))
        print(row['id']+': runner exception retained',flush=True)
