import {MeshoptSimplifier} from './vendor/meshoptimizer/meshopt_simplifier.js';

self.onmessage=async({data})=>{
  const {id,indices,positions,attributes,stride,weights,target}=data;
  try{
    await MeshoptSimplifier.ready;
    const [result]=MeshoptSimplifier.simplifyWithAttributes(indices,positions,3,attributes,stride,weights,null,target,.005);
    self.postMessage({id,indices:result},[result.buffer]);
  }catch(error){self.postMessage({id,error:String(error.message||error)});}
};
