"""Strakkere vierkante uitsnede op expliciet verzoek; product blijft volledig intact."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
source = Image.open(root/'mobiel/product-images/transparant/3211895.png').convert('RGBA')
bounds = source.getbbox()
product = source.crop(bounds)
side = max(product.size) + 20
result = Image.new('RGBA', (side, side), (255,255,255,0))
position = ((side-product.width)//2, (side-product.height)//2)
result.paste(product, position)
assert result.crop((position[0],position[1],position[0]+product.width,position[1]+product.height)).tobytes() == product.tobytes()
assert result.getchannel('A').histogram() [1:] == source.getchannel('A').histogram()[1:]
result.save(root/'mobiel/product-images/transparant/3211895-v2.png', optimize=True)
print(f'{source.size} -> {result.size}; alle productpixels behouden, geen opschaling.')
