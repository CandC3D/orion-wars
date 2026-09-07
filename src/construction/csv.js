// One complete pinned design per CSV. Explicit types + JSON Pointer paths make
// every scalar editable without hiding the ship in a single JSON cell.
import {parsePack,validatePack} from './index.js';
import {validReference} from './design-references.js';
export const CSV_LIMIT=2000000;
export const CSV_HEADER=['drydock_csv_version','ship_number','path','type','value'];
const MAX_ROWS=10000,forbidden=new Set(['__proto__','prototype','constructor']);
const fail=message=>{throw new Error(`CSV: ${message}`);};
const numberPattern=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const encodeKey=k=>k.replaceAll('~','~0').replaceAll('/','~1');
function pathParts(path){
  if(path==='')return [];
  if(!path.startsWith('/'))fail('field paths must be JSON Pointers beginning with /');
  const parts=path.slice(1).split('/').map(k=>{
    if(/~(?![01])/.test(k))fail('invalid path escape');
    const decoded=k.replaceAll('~1','/').replaceAll('~0','~');
    if(forbidden.has(decoded))fail(`unsafe property ${decoded}`);
    return decoded;
  });
  if(parts.length>16)fail('content nesting is too deep');return parts;
}
const quote=value=>`"${String(value).replaceAll('"','""')}"`;
export function exportDesignCSV(pack,shipNumber,tuning){
  if(!validReference(shipNumber))fail('a valid numerical design reference is required');
  const issues=validatePack(pack,tuning);if(issues.length)fail(issues.join('; '));
  const rows=[CSV_HEADER];
  function visit(value,path){
    let type=typeof value,cell;
    if(value===null){type='null';cell='';}
    else if(Array.isArray(value)){type='array';cell=String(value.length);}
    else if(type==='object')cell='';
    else if(type==='string'){
      if(value.includes('\0'))fail('NUL text is not supported; use the JSON pack export');
      // Prefix EVERY text cell, including numeric-looking names and formulas.
      // A literal leading apostrophe therefore becomes two. Import removes one.
      cell="'"+value;
    }else if(type==='number'&&Number.isFinite(value))cell=Object.is(value,-0)?'-0':String(value);
    else if(type==='boolean')cell=String(value);
    else fail('unsupported field value');
    rows.push(['1',String(shipNumber),path,type,cell]);
    if(value&&typeof value==='object')for(const [k,v] of Object.entries(value))visit(v,path+'/'+encodeKey(k));
  }
  visit(pack,'');
  if(rows.length>MAX_ROWS)fail('too many rows');
  const text='\uFEFF'+rows.map(r=>r.map(quote).join(',')).join('\r\n')+'\r\n';
  if(new TextEncoder().encode(text).length>CSV_LIMIT)fail('file exceeds 2 MB');return text;
}
export function readCSV(text){
  if(typeof text!=='string'||text.length>CSV_LIMIT||new TextEncoder().encode(text).length>CSV_LIMIT||text.includes('\0'))fail('file is invalid or exceeds 2 MB');
  text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false,closed=false;
  const field=()=>{row.push(cell);cell='';closed=false;if(row.length>CSV_HEADER.length)fail('too many columns');};
  const line=()=>{field();if(row.length!==1||row[0]!=='')rows.push(row);row=[];if(rows.length>MAX_ROWS)fail('too many rows');};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
    if(c===','){field();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;line();continue;}
    if(closed)fail('unexpected text after a closing quote');
    if(c==='"'){if(cell.length)fail('quote inside an unquoted field');quoted=true;}else cell+=c;
  }
  if(quoted)fail('unterminated quoted field');
  if(cell!==''||closed||row.length)line();
  return rows;
}
export function parseDesignCSV(text,tuning){
  const rows=readCSV(text),header=rows.shift();
  if(JSON.stringify(header)!==JSON.stringify(CSV_HEADER))fail('unrecognized columns; start from a Drydock CSV export');
  if(!rows.length)fail('no design rows');
  const nodes=new Map();let shipNumber=null;
  for(const [i,row] of rows.entries()){
    if(row.length!==5)fail(`row ${i+2} must have five columns`);
    const [version,reference,path,type,cell]=row;
    if(version!=='1')fail('unsupported interchange version');
    if(!/^[1-9]\d*$/.test(reference)||!validReference(Number(reference)))fail(`invalid design number at row ${i+2}`);
    const n=Number(reference);if(shipNumber!==null&&shipNumber!==n)fail('one design number is required throughout this file');shipNumber=n;
    const parts=pathParts(path);if(nodes.has(path))fail(`duplicate path ${path||'(root)'}`);
    let value,length=null;
    if(type==='string'){if(!cell.startsWith("'"))fail(`text at ${path} must retain its leading apostrophe (spreadsheet protection)`);value=cell.slice(1);}
    else if(type==='number'){if(!numberPattern.test(cell)||!Number.isFinite(Number(cell)))fail(`invalid number at ${path}`);value=Number(cell);}
    else if(type==='boolean'){if(!/^(true|false)$/i.test(cell))fail(`invalid boolean at ${path}`);value=cell.toLowerCase()==='true';}
    else if(type==='null'){if(cell!=='')fail(`null field ${path} must be empty`);value=null;}
    else if(type==='object'){if(cell!=='')fail(`object field ${path} must be empty`);value=Object.create(null);}
    else if(type==='array'){if(!/^(0|[1-9]\d*)$/.test(cell)||Number(cell)>MAX_ROWS)fail(`invalid array length at ${path}`);length=Number(cell);value=[];}
    else fail(`unsupported type ${type}`);
    nodes.set(path,{value,type,length,parts,children:0});
  }
  const root=nodes.get('');if(!root||root.type!=='object')fail('root object row is missing');
  // Reconstruct independent of row order; sorting/filtering in a sheet cannot
  // quietly change array order, mount identity, or shield-face associations.
  for(const [path,node] of nodes){
    if(path==='')continue;
    const parentPath=path.slice(0,path.lastIndexOf('/')),parent=nodes.get(parentPath),key=node.parts.at(-1);
    if(!parent||!['object','array'].includes(parent.type))fail(`missing container for ${path}`);
    if(parent.type==='array'&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=parent.length))fail(`invalid array index at ${path}`);
    parent.value[key]=node.value;parent.children++;
  }
  for(const [path,node] of nodes)if(node.type==='array'&&node.children!==node.length)fail(`missing array rows at ${path}`);
  // The normal shared validator is still authoritative, including forbidden
  // fields, supported profiles, complete component references, arcs and limits.
  const pack=parsePack(JSON.stringify(root.value),tuning);
  return {pack,shipNumber};
}
