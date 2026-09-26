"""Select a tuned default only after measured validation and browser GPU checks."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    summaries=json.loads((ROOT/'artifacts/evaluation/validation-summary.json').read_text())
    results={r['configuration']:r for r in summaries}
    browser=json.loads((ROOT/'reports/browser-tuned.json').read_text())
    def score(id,category):return results[id+'-retrieval']['categories'][category]['accuracy']
    def passes(id):
        manifest=json.loads((ROOT/'public/models'/id/'manifest.json').read_text())
        observed=browser[id]
        current=(observed.get('modelSha256')==manifest['files']['weights']['sha256'] and observed.get('patchSha256')==manifest['runtime']['patchSha256']
                 and results[id+'-retrieval']['modelSha256']==manifest['files']['weights']['sha256'])
        return score(id,'validation')>=.9 and score(id,'unknown')>=.9 and observed['runtimePassed'] and current
    q8=score('tuned-q8','validation');q4=score('tuned-q4','validation')
    preferred='tuned-q8' if q8-q4>.02 else 'tuned-q4'
    selected=preferred if passes(preferred) else 'tuned-q8' if passes('tuned-q8') else 'base-q8'
    registry_path=ROOT/'public/models/registry.json';registry=json.loads(registry_path.read_text());registry['default']=selected
    registry_path.write_text(json.dumps(registry,indent=2)+'\n')
    selection=dict(default=selected,preferredQuantization=preferred,q8FactualAccuracy=q8,q4FactualAccuracy=q4,quantizationLossPercentagePoints=(q8-q4)*100,
                   tunedQ4Passes=passes('tuned-q4'),tunedQ8Passes=passes('tuned-q8'),acceptance={'factual':.9,'unknown':.9},basis='Separate validation questions plus browser generation checks; test scores were not used for default selection.')
    (ROOT/'reports/model-selection.json').write_text(json.dumps(selection,indent=2)+'\n');print(json.dumps(selection,indent=2))
if __name__=='__main__':main()
