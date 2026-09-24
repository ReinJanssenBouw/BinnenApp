"""Strakkere uitsnede: alleen lege marge verwijderen, productpixels behouden."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
for code in ['101296','237262']:
    source=Image.open(root/f'mobiel/product-images/transparant/{code}.png').convert('RGBA')
    product=source.crop(source.getbbox())
    side=max(product.size)+20
    result=Image.new('RGBA',(side,side),(255,255,255,0))
    x,y=(side-product.width)//2,(side-product.height)//2
    result.paste(product,(x,y))
    assert result.crop((x,y,x+product.width,y+product.height)).tobytes()==product.tobytes()
    assert result.getchannel('A').histogram()[1:]==source.getchannel('A').histogram()[1:]
    result.save(root/f'mobiel/product-images/transparant/{code}-v2.png',optimize=True)
    print(code,source.size,'->',result.size,'alle productpixels behouden')
