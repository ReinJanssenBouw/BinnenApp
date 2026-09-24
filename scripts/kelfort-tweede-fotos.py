from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
root=Path(__file__).resolve().parent.parent
for code in ['3404675','3420669']:
    source=Image.open(root/f'foto-bewerking/originelen/{code}-foto2.jpg').convert('RGB')
    side=max(source.size)
    square=Image.new('RGB',(side,side),'white')
    square.paste(source,((side-source.width)//2,(side-source.height)//2))
    rgb=np.asarray(square)
    white=(rgb.min(axis=2)>=245)&((rgb.max(axis=2).astype(int)-rgb.min(axis=2))<=8)
    mask=Image.fromarray(np.pad(white.astype('uint8')*255,1,constant_values=255)).copy()
    ImageDraw.floodfill(mask,(0,0),128,thresh=0)
    background=np.asarray(mask)[1:-1,1:-1]==128
    result=square.convert('RGBA')
    result.putalpha(Image.fromarray(np.where(background,0,255).astype('uint8')))
    assert np.array_equal(np.asarray(result)[:,:,:3],rgb)
    assert result.width==result.height and background.mean()>.1
    result.save(root/f'mobiel/product-images/transparant/{code}-foto2.png',optimize=True)
    print(code,source.size,result.size,'originele RGB behouden')
