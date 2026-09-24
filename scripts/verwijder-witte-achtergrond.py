"""User-approved deterministic extraction. Never rescale/crop/change product RGB."""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
output = root / 'mobiel/product-images/transparant'
output.mkdir(parents=True, exist_ok=True)
rows = json.loads((root/'scripts/productfotos-20260924.json').read_text(encoding='utf-8-sig'))['rows']
previews = []
report = []
for row in rows:
    code = row['ean_code']
    source = root / (f'foto-bewerking/originelen/{code}.jpg' if row['id'] <= 4 else f'mobiel/product-images/{code}.png')
    original = Image.open(source).convert('RGB')
    side = max(original.size)
    im = Image.new('RGB', (side, side), 'white')
    im.paste(original, ((side-original.width)//2, (side-original.height)//2))
    rgb = np.asarray(im)
    # Only near-neutral white attached to the outside canvas is background.
    candidate = (rgb.min(axis=2) >= 245) & ((rgb.max(axis=2).astype(int)-rgb.min(axis=2)) <= 8)
    mask = Image.fromarray(np.pad(candidate.astype('uint8')*255, 1, constant_values=255)).copy()
    ImageDraw.floodfill(mask, (0,0), 128, thresh=0)
    # Visually verified openings: do not erase white labels or product surfaces.
    holes = {
      '116366': [(154,34)], '116365': [(162,19)],
      '160108': [(110,110)], '3249788': [(70,194),(145,236),(232,142)],
      '101296': [(364,237)], '244003': [(196,111)],
      '115807': [(99,68),(218,68),(63,110),(254,112),(61,214),(254,215),(95,256),(216,260)],
      '114230': [(219,86),(225,109),(212,120),(220,149),(224,184),(219,199),
                  (235,83),(236,130),(235,172),(235,202),(211,180),(174,201),(170,217),
                  (166,141),(169,165),(165,118),(168,94),(116,170),(109,160),(109,138),
                  (108,114),(108,92),(108,68),(118,12),(119,43),(101,206),(90,210)],
      '3362036': [(219,86),(225,109),(212,120),(220,149),(224,184),(219,199),
                  (235,83),(236,130),(235,172),(235,202),(211,180),(174,201),(170,217),
                  (166,141),(169,165),(165,118),(168,94),(116,170),(109,160),(109,138),
                  (108,114),(108,92),(108,68),(118,12),(119,43),(101,206),(90,210)],
    }
    for x,y in holes.get(code, []):
        if 0 <= x < side and 0 <= y < side and candidate[y,x]:
            ImageDraw.floodfill(mask, (x+1,y+1), 128, thresh=0)
    bg = np.asarray(mask)[1:-1,1:-1] == 128
    if code == '116365':
        # The pale plastic bag is part of this product, not its backdrop.
        keep = Image.new('1',(side,side))
        outline=[(36,1),(269,1),(269,134),(276,151),(265,200),(250,270),
                 (263,283),(286,295),(297,307),(295,313),(245,317),
                 (12,317),(6,310),(20,300),(47,282),(55,264),(49,247),
                 (38,220),(33,193),(30,157),(33,140)]
        ImageDraw.Draw(keep).polygon([(x+(side-original.width)//2,y) for x,y in outline],fill=1)
        protected=np.asarray(keep).astype(bool)
        # Leave the hanging hole transparent.
        protected[:40,:]=False
        bg &= ~protected
    alpha = np.where(bg, 0, 255).astype('uint8')
    result = im.convert('RGBA')
    result.putalpha(Image.fromarray(alpha))
    result.save(output/f'{code}.png', optimize=True)
    assert result.width == result.height
    assert np.array_equal(np.asarray(result)[:,:,:3], rgb)
    assert bg.mean() > .005
    thumb = result.copy()
    thumb.thumbnail((180,180))
    tile = Image.new('RGB',(200,210),'#b1c2d5')
    tile.paste(thumb,((200-thumb.width)//2,0),thumb)
    ImageDraw.Draw(tile).text((10,187),f"JB{row['id']:04} / {code}",fill='black')
    previews.append(tile)
    report.append({'id':row['id'],'code':code,'size':side,'transparent_percent':round(bg.mean()*100,1),'rgb_unchanged':True})
sheet = Image.new('RGB',(1000,210*((len(previews)+4)//5)),'white')
for n,tile in enumerate(previews): sheet.paste(tile,((n%5)*200,(n//5)*210))
sheet.save(root/'foto-bewerking/controle.png')
(root/'foto-bewerking/controle.json').write_text(json.dumps(report,indent=2))
print(f'{len(report)} vierkante PNGs, product-RGB identiek, transparante achtergrond.')


