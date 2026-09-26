"""Expected IDs from the preserved Hugging Face tokenizer, independent of Flare."""
import json
from pathlib import Path
from tokenizers import Tokenizer
ROOT=Path(__file__).resolve().parents[1]
def main():
    t=Tokenizer.from_file(str(ROOT/'.cache/models/tokenizer.json'))
    texts=['', 'a\n\nb', 'a  b', 'x\n\n', 'a\n\n123', "Hello, don't 123! café\t\tend",
           '<|im_start|>user\nWho owns it?<|im_end|>\n<|im_start|>assistant\n',
           '08:00–16:00', 'O Rings — quantity: 60.', 'naïve café déjà vu', 'Line\r\n\r\nNext']
    for left in ['a','station','123','café','—','!']:
        for gap in [' ','  ','\n','\n\n','\t\t',' \n ']:texts.append(left+gap+'Request: 0123?')
    rows=[dict(text=s,ids=t.encode(s,add_special_tokens=False).ids) for s in texts]
    (ROOT/'data/tokenizer-fixtures.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
