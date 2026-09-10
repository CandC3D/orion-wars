import * as THREE from 'three';
import {SIZES,mm} from './scale.js';
import {physicalMaterial,physicalMesh} from './materials.js';

// Hull-specific supplied designations. Absence is intentional, not a fallback.
export const RIM_CODES=Object.freeze({'EAR/frigate':null,'KRE/frigate':'KFG-01','VRA/frigate':'VFG-04'});
const font='bold 192px Arial';
const radius=mm(SIZES.baseAcrossFlats)/Math.sqrt(3),height=mm(SIZES.baseHeight);
const inset=.055*Math.cos(Math.PI/6),slant=Math.hypot(height,inset);
export const RIM_LIMITS=Object.freeze({skirtHeightMm:SIZES.baseHeight,slantHeightMm:slant*10,
  maximumCapHeightMm:(slant-mm(.4))*10,edgeMarginMm:.2,minimumFaceWidthMm:(radius-.055)*10});

function decal(code,paper=false){
  const c=document.createElement('canvas');c.width=1200;c.height=300;
  const ctx=c.getContext('2d');ctx.font=font;ctx.fillStyle=paper?'#101010':'#eee9dd';ctx.fillText(code,20,230);
  const pixels=ctx.getImageData(0,0,c.width,c.height).data;let x0=c.width,y0=c.height,x1=0,y1=0;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(pixels[(y*c.width+x)*4+3]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  if(x1<=x0||y1<=y0)throw Error('No printed glyphs');
  const w=x1-x0+1,h=y1-y0+1,trim=document.createElement('canvas');trim.width=w+2;trim.height=h+2;
  const ink=trim.getContext('2d');if(paper){ink.fillStyle='#eee9dd';ink.fillRect(0,0,trim.width,trim.height);}ink.drawImage(c,x0,y0,w,h,1,1,w,h);
  const texture=new THREE.CanvasTexture(trim);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
  const material=physicalMaterial(code+(paper?' / paper label':' / off-white waterslide ink'),{map:texture,alphaTest:paper?0:.02,roughness:.88,metalness:0});
  // Coverage-preserving alpha-to-coverage is unavailable on the current single-sample physical target.
  return {material,inkAspect:w/h,textureAspect:(w+2)/(h+2),paddingFactor:(h+2)/h,font,sourceInkPixels:[w,h]};
}

function geometry(inkHeightMm,print){
  if(!(inkHeightMm>0&&inkHeightMm<=RIM_LIMITS.maximumCapHeightMm+1e-9))throw Error('Text exceeds the existing skirt');
  const h=mm(inkHeightMm)*print.paddingFactor,w=h*print.textureAspect;
  if(w>mm(RIM_LIMITS.minimumFaceWidthMm-.8))throw Error('Text exceeds one rim face');
  const positions=[],uv=[],faces=[];
  for(let i=0;i<6;i++){
    const a=(i+.5)*Math.PI/3,n=new THREE.Vector3(Math.sin(a),0,Math.cos(a)),right=new THREE.Vector3(Math.cos(a),0,-Math.sin(a));
    const up=n.clone().multiplyScalar(-inset).add(new THREE.Vector3(0,height,0)).normalize();
    const normal=new THREE.Vector3().crossVectors(right,up).normalize();
    const centre=n.clone().multiplyScalar(radius*Math.cos(Math.PI/6)-inset/2).add(new THREE.Vector3(0,height/2,0)).addScaledVector(normal,.0006);
    const point=(x,y)=>centre.clone().addScaledVector(right,x).addScaledVector(up,y);
    const corners=[point(-w/2,-h/2),point(w/2,-h/2),point(w/2,h/2),point(-w/2,h/2)];
    for(const k of [0,1,2,0,2,3])positions.push(...corners[k]);uv.push(0,0,1,0,1,1,0,0,1,1,0,1);
    faces.push({centre,normal,right,up,corners,inkHeight:mm(inkHeightMm),inkWidth:mm(inkHeightMm)*print.inkAspect});
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();g.userData.rim={faces,inkHeightMm,inkWidthMm:inkHeightMm*print.inkAspect};return g;
}

export function createRimLabels(scene,units){
  const records=new Map();let capHeight=2.6,paper=false;
  for(const u of units){
    const key=u.faction+'/'+u.className;if(!(key in RIM_CODES))throw Error('No rim designation decision for '+key);
    const code=RIM_CODES[key];if(code===null){records.set(u.id,{code:null});continue;}
    const print=decal(code),mesh=physicalMesh(u.id+' / six repeated rim codes',geometry(capHeight,print),print.material);
    mesh.matrixAutoUpdate=false;scene.add(mesh);records.set(u.id,{code,print,mesh});
  }
  function update(units,bases){
    for(const r of records.values())if(r.mesh)r.mesh.visible=false;
    units.forEach((u,i)=>{const r=records.get(u.id);if(!r)throw Error('Unknown study unit');if(r.mesh){bases.getMatrixAt(i,r.mesh.matrix);r.mesh.visible=true;r.mesh.matrixWorldNeedsUpdate=true;}});
  }
  function measure(camera,canvas){
    const screen=p=>{const q=p.clone().project(camera);return new THREE.Vector2((q.x+1)*canvas.width/2,(1-q.y)*canvas.height/2);};
    return {capHeightMm:capHeight,limits:RIM_LIMITS,font,method:(paper?'Black print on off-white paper':'Off-white waterslide decal')+', six identical repetitions, one per bevelled skirt face',units:[...records].map(([id,r])=>{
      if(!r.mesh)return {id,code:null,status:'requested blank Earth rim; unscored in this test',faces:[]};
      r.mesh.updateMatrixWorld(true);const m=r.mesh.matrixWorld;
      const faces=r.mesh.geometry.userData.rim.faces.map((f,i)=>{
        const p=f.centre.clone().applyMatrix4(m),n=f.normal.clone().transformDirection(m),toward=camera.position.clone().sub(p).normalize();
        const project=(x,y)=>screen(f.centre.clone().addScaledVector(f.right,x).addScaledVector(f.up,y).applyMatrix4(m));
        const bottom=project(0,-f.inkHeight/2),top=project(0,f.inkHeight/2),left=project(-f.inkWidth/2,0),right=project(f.inkWidth/2,0),corners=f.corners.map(v=>screen(v.clone().applyMatrix4(m)));
        const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),capPixels=top.distanceTo(bottom);
        return {face:i,frontFacing:n.dot(toward)>0,viewCosine:n.dot(toward),capPixels,
          entireSkirtPixels:project(0,slant/2).distanceTo(project(0,-slant/2)),
          widthPixels:left.distanceTo(right),bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}};
      });
      const best=faces.filter(f=>f.frontFacing).sort((a,b)=>b.widthPixels-a.widthPixels)[0];
      return {id,code:r.code,capHeightMm:capHeight,inkWidthMm:r.mesh.geometry.userData.rim.inkWidthMm,sourceInkPixels:r.print.sourceInkPixels,faces,best};
    })};
  }
  return {update,measure,setHeight(mm){for(const r of records.values())if(r.mesh){const g=geometry(mm,r.print);r.mesh.geometry.dispose();r.mesh.geometry=g;}capHeight=mm;},
    setPaper(value){if(paper===value)return;for(const r of records.values())if(r.mesh){r.print.material.map.dispose();r.print.material.dispose();r.print=decal(r.code,value);r.mesh.material=r.print.material;}paper=value;},
    // Project intermediate angles without putting non-integer headings into a rules packet.
    // This is geometric availability only, not an occlusion/legibility result.
    transitSweep(camera,canvas){const result=[];for(let degrees=0;degrees<60;degrees+=5){const saved=[];for(const r of records.values())if(r.mesh){saved.push([r.mesh,r.mesh.matrix.clone()]);r.mesh.matrix.multiply(new THREE.Matrix4().makeRotationY(degrees*Math.PI/180));r.mesh.matrixWorldNeedsUpdate=true;}
      result.push({degrees,measure:measure(camera,canvas)});for(const [mesh,m] of saved){mesh.matrix.copy(m);mesh.matrixWorldNeedsUpdate=true;}}return result;},
    setVisible(v){for(const r of records.values())if(r.mesh)r.mesh.visible=v;},
    validateFit(){return [...records].filter(([,r])=>r.mesh).map(([id,r])=>{const p=r.mesh.geometry.attributes.position,ys=Array.from({length:p.count},(_,i)=>p.getY(i)*10);return {id,minYmm:Math.min(...ys),maxYmm:Math.max(...ys),faces:r.mesh.geometry.userData.rim.faces.length,physical:r.mesh.userData.register==='physical'&&r.mesh.material.emissive.getHex()===0};});}};
}
