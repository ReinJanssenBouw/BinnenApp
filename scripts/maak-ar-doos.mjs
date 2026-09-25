// Bouwgereedschap: npm.cmd install --prefix dist/usdz-tools --ignore-scripts three@0.180.0
import { Scene, Mesh, BoxGeometry, MeshStandardMaterial, Box3, Vector3 } from '../dist/usdz-tools/node_modules/three/build/three.module.js';
import { USDZExporter } from '../dist/usdz-tools/node_modules/three/examples/jsm/exporters/USDZExporter.js';
import { writeFileSync } from 'node:fs';
const scene=new Scene();scene.name='BinnenApp_doos';
function part(name,dimensions,position,color){const mesh=new Mesh(new BoxGeometry(...dimensions),new MeshStandardMaterial({color,roughness:0.85,metalness:0}));mesh.name=name;mesh.position.set(...position);scene.add(mesh);}
part('Doos',[.3,.3,.3],[0,.15,0],0xb78653);
part('Blauwe_tape_boven',[.055,.001,.301],[0,.3005,0],0x2453b8);
part('Blauwe_tape_voor',[.055,.3,.001],[0,.15,.1505],0x2453b8);
part('Blauwe_tape_achter',[.055,.3,.001],[0,.15,-.1505],0x2453b8);
part('Etiket',[.09,.06,.001],[-.085,.185,.1505],0xf5f7fb);
for(let i=0;i<3;i++)part('Etiket_streep_'+i,[.062,.004,.001],[-.085,.20-i*.012,.1511],0x16324f);
scene.updateMatrixWorld(true);
const bytes=await new USDZExporter().parseAsync(scene);
writeFileSync(new URL('../mobiel/ar/doos.usdz',import.meta.url),bytes);
const size=new Box3().setFromObject(scene).getSize(new Vector3());
if(size.x<.29||size.x>.31||size.y<.29||size.y>.31||size.z<.29||size.z>.31)throw new Error('Verkeerde doosafmeting');
console.log('USDZ-doos gemaakt:',bytes.length,'bytes, afmetingen (m):',size.toArray());
