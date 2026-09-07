import {REFERENCE_KEY,REFERENCE_LOCK,STOCK_REFERENCES,readReferences,referenceFor,planReference,assignReference} from '../src/construction/design-references.js';

// Only small catalogue metadata is written here, never designs or battle state.
export function createReferencePanel({onError,onReady=()=>{}}){
  let registry={entries:[]};const pending=new Map();
  const refresh=()=>{registry=readReferences(localStorage).registry;return registry;};
  function labels(){
    for(const el of document.querySelectorAll('[data-design-reference]')){
      const id=el.dataset.designReference,number=referenceFor(id,registry);
      el.textContent=number===null?'…':`#${number}`;
      el.dataset.referenceNumber=number??'';
      el.title=`Numerical design reference in this browser. Canonical design key: ${id}`;
    }
  }
  async function locked(fn){
    if(!navigator.locks)throw new Error('Allocating numerical design references requires Web Locks support; JSON packs remain available');
    return navigator.locks.request(REFERENCE_LOCK,fn);
  }
  async function ensure(id,preferred=null){
    // Fixed stock references remain usable even if local registry storage fails.
    if(Object.hasOwn(STOCK_REFERENCES,id)&&preferred===null)return STOCK_REFERENCES[id];
    let plan=planReference(refresh(),id,preferred);if(!plan.create){labels();return plan.number;}
    const result=await locked(()=>{const current=readReferences(localStorage);return assignReference(localStorage,id,preferred,current.raw);});
    registry=result.registry;labels();onReady();return result.number;
  }
  function render(){
    try{refresh();}catch(error){onError(`Numerical references unavailable: ${error.message}. Existing registry was not overwritten; JSON export remains available.`);labels();return;}
    onReady();
    labels();
    for(const el of document.querySelectorAll('[data-design-reference]')){
      const id=el.dataset.designReference;if(referenceFor(id,registry)!==null||pending.has(id))continue;
      const job=ensure(id).catch(error=>{
        onError(`Numerical reference could not be stored: ${error.message}. JSON export remains available.`);
        for(const node of document.querySelectorAll('[data-design-reference]'))if(node.dataset.designReference===id)node.textContent='unavailable';
      }).finally(()=>pending.delete(id));pending.set(id,job);
    }
  }
  window.addEventListener('storage',event=>{if(event.key===REFERENCE_KEY||event.key===null)render();});
  return {
    render,ensure,
    preview(id,preferred=null){return planReference(refresh(),id,preferred);},
    async accept(id,preferred,expectedNumber){
      return locked(()=>{
        const current=readReferences(localStorage),plan=planReference(current.registry,id,preferred);
        if(plan.number!==expectedNumber)return {changed:true,plan};
        const result=assignReference(localStorage,id,preferred,current.raw);registry=result.registry;labels();
        return {changed:false,plan:result};
      });
    }
  };
}
