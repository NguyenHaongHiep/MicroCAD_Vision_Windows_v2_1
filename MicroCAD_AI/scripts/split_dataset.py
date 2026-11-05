import argparse,random,shutil
from pathlib import Path
EXTS={'.png','.jpg','.jpeg','.webp','.bmp'}
if __name__=='__main__':
 p=argparse.ArgumentParser(description='Mỗi thư mục con là một nhóm/phiên chụp');p.add_argument('--source',type=Path,required=True);p.add_argument('--dataset',type=Path,default=Path(__file__).parents[1]/'dataset');p.add_argument('--seed',type=int,default=42);p.add_argument('--val',type=float,default=.2);p.add_argument('--test',type=float,default=.1);a=p.parse_args();groups=sorted(x for x in a.source.iterdir() if x.is_dir());random.Random(a.seed).shuffle(groups);n=len(groups);nt=round(n*a.test);nv=round(n*a.val);sets={'test':groups[:nt],'val':groups[nt:nt+nv],'train':groups[nt+nv:]}
 for split,items in sets.items():
  for kind in ('images','labels'):(a.dataset/kind/split).mkdir(parents=True,exist_ok=True)
  for group in items:
   for image in group.rglob('*'):
    if image.suffix.lower() not in EXTS:continue
    label=image.with_suffix('.txt')
    if not label.exists():print('Thiếu label:',image);continue
    stem=f'{group.name}__{image.stem}';shutil.copy2(image,a.dataset/'images'/split/f'{stem}{image.suffix.lower()}');shutil.copy2(label,a.dataset/'labels'/split/f'{stem}.txt')
 print({k:[x.name for x in v] for k,v in sets.items()})
