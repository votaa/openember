"""Request-owned evidence refresh. No Streamlit access; safe in the existing worker."""
import copy
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone


def refresh_cloud_noaa(endpoints,results,intervals,fetcher,now=None):
    now=now or datetime.now(timezone.utc)
    retained=copy.deepcopy(results)
    def needed(ep):
        result=retained.get(ep['id'])
        if not result:return True
        interval=intervals.get(ep['id'],0)
        if not interval:return False
        try:
            return (now-datetime.fromisoformat(result['fetched_at'].replace('Z','+00:00'))).total_seconds()>=interval
        except (KeyError,ValueError,TypeError):return True
    targets=[ep for ep in endpoints if needed(ep)]
    with ThreadPoolExecutor(max_workers=6) as pool:
        for ep,result in zip(targets,pool.map(fetcher,targets)):retained[ep['id']]=result
    return retained
