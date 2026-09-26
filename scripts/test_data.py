"""Check leakage boundaries and evaluation grading behavior, not model capability."""
import json
from pathlib import Path
import unittest
from evaluate import contains, grade
ROOT=Path(__file__).resolve().parents[1]
class DatasetTests(unittest.TestCase):
    def test_entity_holdouts_never_appear_in_training(self):
        manifest=json.loads((ROOT/'data/manifest.json').read_text())
        graph=json.loads((ROOT/'public/data/station.json').read_text())
        held=set(manifest['heldOutTestEntities']+manifest['heldOutValidationEntities'])
        training=(ROOT/'data/train.jsonl').read_text()
        for entity in graph['entities']:
            if entity['id'] in held:
                self.assertNotIn(entity['label'],training)
                self.assertNotIn('"'+entity['id']+'"',training)
    def test_split_wording_and_event_payloads(self):
        train=[json.loads(line) for line in (ROOT/'data/train.jsonl').read_text().splitlines()]
        test=json.loads((ROOT/'data/evaluation.json').read_text())
        questions={r['messages'][-2]['content'].split('Request: ')[-1] for r in train}
        for case in test:self.assertFalse(case['question'] in questions, case['id'])
    def test_numbers_are_whole_values(self):
        self.assertFalse(contains('There are 17 packs','1'))
        self.assertTrue(contains('There are 17 packs','17'))
    def test_event_claims_are_not_credited(self):
        case={'category':'event','question':'stock_low','expected':'Filters','event':{'type':'stock_low','payload':{'remaining':2}}}
        self.assertFalse(grade(case,'Filters: 2. I have ordered more.',[],{'entities':[]})['correct'])
if __name__=='__main__':unittest.main()
