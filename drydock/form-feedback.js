// Persistent feedback supplements native constraint validation; it never
// cancels invalid events, changes field constraints, or submits rejected data.
export function formFeedback(form, region) {
  let reported=false;
  const marked=new Map();
  const restore=()=>{
    for(const [field,attributes] of marked)for(const [name,value] of attributes)
      if(value===null)field.removeAttribute(name);else field.setAttribute(name,value);
    marked.clear();
  };
  const clear=()=>{reported=false;restore();region.textContent='';};
  const refresh=()=>{
    if(!reported)return;
    restore();
    const invalid=[...form.elements].filter(field=>field.willValidate&&!field.validity.valid);
    region.textContent=invalid.map(field=>{
      marked.set(field,['aria-invalid','aria-errormessage'].map(name=>[name,field.getAttribute(name)]));
      field.setAttribute('aria-invalid','true');field.setAttribute('aria-errormessage',region.id);
      const label=field.labels?.[0]?.textContent.trim().replace(/\s+/g,' ')||field.name||'Field';
      return `${label}: ${field.validationMessage}`;
    }).join('\n');
  };
  // The invalid event does not bubble. Capturing it keeps the browser's focus
  // and validation bubble intact while also filling the persistent alert.
  form.addEventListener('invalid',()=>{reported=true;refresh();},true);
  for(const event of ['input','change'])form.addEventListener(event,()=>{
    if(reported)refresh();else if(region.textContent)clear();
  });
  form.addEventListener('submit',clear,true);
  form.closest('dialog')?.addEventListener('close',clear);
  return {clear,refresh,show(message){clear();region.textContent=message;}};
}
