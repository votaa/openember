"""Deterministic facts only. No inference or discovery imports."""
from datetime import datetime, timezone
from copilot_contract import POLICY


def local_answer(request, plan):
    used, parts = {}, []
    for op in plan['operations']:
        if op['status'] != 'ready':
            parts.append(POLICY['limitations'].get(op['reason'],'This part requires more evidence or clarification.')+' No exact value is inferred.')
            continue
        for b in request['evidence']:
            if b['source']['id'] not in op['scope']['source_ids']:
                continue
            used[b['id']] = b
            if op['intent'] == 'forecast_facts':
                rows = []
                for p in b['values']['periods']:
                    if datetime.fromisoformat(p['startTime'].replace('Z','+00:00')) < datetime.fromisoformat(op['scope']['interval']['start'].replace('Z','+00:00')) or datetime.fromisoformat(p['endTime'].replace('Z','+00:00')) > datetime.fromisoformat(op['scope']['interval']['end'].replace('Z','+00:00')):
                        continue
                    fields = []
                    for field in op['scope']['fields']:
                        if field == 'wind': fields.append(f"Wind: {p['windSpeed']} {p['windDirection']}")
                        elif field == 'conditions': fields.append(f"Conditions: {p.get('detailedForecast') or p.get('shortForecast')}")
                        elif field == 'precipitation probability': fields.append(f"Precipitation probability: {p['probabilityOfPrecipitation']['value']}%")
                        else: fields.append(f"{dict(temperature='Temperature',low='Low',high='High')[field]}: {p['temperature']}°{p['temperatureUnit']}")
                    rows.append(f"{p.get('name') or 'Forecast period'}: {'; '.join(fields)}.\nValid: {p['startTime']} — {p['endTime']} ({op['scope']['timezone']}).")
                facts = '\n'.join(rows)
            elif op['intent'] == 'map_count':
                facts = f"Complete matching count: {b['values']['complete_count']} features. These are features, not distinct organizations or departments."
            else:
                window = op['scope']['interval'] or {}
                facts = '\n'.join(f"{row['label']}: {row['total']}" for row in b['values']['aggregate_counts'])
                facts += f"\nReporting window: {window.get('start')} — {window.get('end')} ({window.get('timezone')}).\nReported NYC 311 complaints, not utility-confirmed outages."
            parts.append(f"{b['source']['name']}\n{facts}\nSource: {b['source']['url'] or 'URL unavailable'}\nFetched: {b['fetched_at'] or 'unavailable'}\nGeography: {b['geography'] or 'unspecified'}; filter: {b['scope']['filter'] or 'unspecified'}; where: {b['scope']['where'] or 'unspecified'}; scope: {b['scope']['description'] or 'as supplied'}.")
    return dict(contract_version='1.0',request_id=request['request_id'],execution_mode='local_query',
                answer_status='clarification' if plan['outcome']=='clarification' else 'answered' if all(op['status']=='ready' for op in plan['operations']) else 'unsupported',
                intents=[op['intent'] for op in plan['operations']],answer='\n\n'.join(parts),evidence_ids=list(used),response_scope=[op['scope'] for op in plan['operations']],
                provider=None,model=None,attempts=[],requested_at=request['requested_at'],generated_at=datetime.now(timezone.utc).isoformat(),
                freshness=[dict(evidence_id=b['id'],state=b['state']) for b in used.values()],warnings=[op['reason'] for op in plan['operations'] if op['reason']],timing={})
