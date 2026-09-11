import * as THREE from 'three';
import {SIZES,mm} from './scale.js';

// A closed convex optical volume fitted to each connected source-colour patch.
// Caps affect refraction depth only. The visible triangles are never altered.
export function convexPlanes(points){
  const unique=[...new Map(points.map(p=>[p.map(n=>n.toFixed(6)).join(','),new THREE.Vector3(...p)])).values()];
  if(unique.length>90)throw Error('Inspect a complex crystal before fitting its optical volume');
  const planes=new Map(),eps=1e-5;
  for(let i=0;i<unique.length-2;i++)for(let j=i+1;j<unique.length-1;j++)for(let k=j+1;k<unique.length;k++){
    const a=unique[i],n=new THREE.Vector3().subVectors(unique[j],a).cross(new THREE.Vector3().subVectors(unique[k],a));
    if(n.length()<eps)continue;n.normalize();let d=-n.dot(a),positive=false,negative=false;
    for(const p of unique){const v=n.dot(p)+d;positive ||= v>eps;negative ||= v< -eps;if(positive&&negative)break;}
    if(positive&&negative)continue;if(!positive&&!negative)continue;
    if(positive){n.negate();d=-d;}
    const plane=[...n.toArray(),d],key=plane.map(v=>Math.round(v*1e4)).join(',');planes.set(key,plane);
  }
  const result=[...planes.values()];
  if(result.length<4||result.length>128)throw Error('Unresolved crystal optical volume: '+result.length+' planes');
  return result;
}

export function plasticMaterial({name,colour=[.96,.985,1],attenuationDistance=3,planes=null,post=false}){
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,metalness:0,roughness:.095,
    transmission:1,ior:1.57,thickness:1,attenuationColor:new THREE.Color().setRGB(...colour),
    attenuationDistance,emissive:0,emissiveIntensity:0,transparent:false,opacity:1});
  material.name=name;material.userData.register='physical';material.userData.classification='moulded transparent';
  material.userData.opticalAudit={value:0};
  material.onBeforeCompile=s=>{
    s.uniforms.opticalAudit=material.userData.opticalAudit;
    s.vertexShader='varying vec3 vPlasticPosition; attribute vec2 opticalVolume; varying vec2 vOpticalVolume;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPlasticPosition=position;vOpticalVolume=opticalVolume;');
    let depth;
    if(post){
      const height=mm(SIZES.postHeight),rb=mm(SIZES.postBottomDiameter/2),rt=mm(SIZES.postTopDiameter/2);
      // Exact ray exit from the finite tapered cone, including its end caps.
      s.fragmentShader=`float postExit(vec3 p,vec3 d){
float h=${(height/2).toPrecision(9)},r=${((rb+rt)/2).toPrecision(9)},k=${((rt-rb)/height).toPrecision(9)};float rp=r+k*p.y;
float a=dot(d.xz,d.xz)-k*k*d.y*d.y;
float b=2.*(dot(p.xz,d.xz)-rp*k*d.y);
float c=dot(p.xz,p.xz)-rp*rp;float disc=max(0.,b*b-4.*a*c);
float exit=100.;if(abs(a)>.000001){float x=(-b-sqrt(disc))/(2.*a),y=(-b+sqrt(disc))/(2.*a);if(x>.00001)exit=min(exit,x);if(y>.00001)exit=min(exit,y);}
if(abs(d.y)>.000001){float cap=((d.y>0.?h:-h)-p.y)/d.y;if(cap>.00001)exit=min(exit,cap);}
return clamp(exit,.002,${(height*1.1).toPrecision(9)});}
`+s.fragmentShader;
      depth='postExit(vPlasticPosition,plasticRay)';
    }else{
      s.uniforms.opticalPlanes={value:planes};s.uniforms.opticalPlaneWidth={value:planes.image.width};
      s.fragmentShader=`uniform sampler2D opticalPlanes; uniform float opticalPlaneWidth;
float crystalExit(vec3 p,vec3 ray){float exit=100.;for(int i=0;i<128;i++){if(float(i)>=vOpticalVolume.y)break;
vec4 plane=texture2D(opticalPlanes,vec2((vOpticalVolume.x+float(i)+.5)/opticalPlaneWidth,.5));
float slope=dot(plane.xyz,ray);if(slope>.000001)exit=min(exit,max(0.,-(dot(plane.xyz,p)+plane.w)/slope));}
return clamp(exit,.002,10.);}
`+s.fragmentShader;
      depth='crystalExit(vPlasticPosition,plasticRay)';
    }
    s.fragmentShader='uniform float opticalAudit; varying vec3 vPlasticPosition; varying vec2 vOpticalVolume;\n'+s.fragmentShader;
    const chunk=THREE.ShaderChunk.transmission_fragment;
    s.fragmentShader=s.fragmentShader.replace('#include <transmission_fragment>',chunk.replace('vec4 transmitted = getIBLVolumeRefraction(',
      `vec3 plasticRay=inverseTransformDirection(refract(-v,n,1./material.ior),modelMatrix);
material.thickness=${depth};
vec4 transmitted = getIBLVolumeRefraction(`));
    s.fragmentShader=s.fragmentShader.replace('#include <colorspace_fragment>','#include <colorspace_fragment>\nif(opticalAudit>.5)gl_FragColor=vec4(clamp(material.thickness/2.,0.,1.),.9375,.0625,1.);');
  };
  material.customProgramCacheKey=()=>post?'finite-styrene-post-v7':'source-convex-styrene-v7';
  return material;
}

export function transmittingShadow(mesh,opacity){
  // Coverage approximation for transmitted key light, filtered by the existing
  // shadow map. No opaque black rod shadow; no claim of refractive caustics.
  mesh.customDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,opacity,alphaHash:true});
  const coverage={value:opacity};mesh.customDepthMaterial.userData.coverage=coverage;
  mesh.customDepthMaterial.onBeforeCompile=s=>{
    s.uniforms.transmittedShadowCoverage=coverage;
    s.fragmentShader='uniform float transmittedShadowCoverage;\n'+s.fragmentShader;
    // RGB-packed depth ignores MeshDepthMaterial.opacity, so set coverage at
    // the hash explicitly rather than accidentally retaining an opaque shadow.
    s.fragmentShader=s.fragmentShader.replace('#include <alphahash_fragment>','diffuseColor.a=transmittedShadowCoverage;\n#include <alphahash_fragment>');
  };
  mesh.customDepthMaterial.customProgramCacheKey=()=> 'transmitting-key-shadow-v7';
  mesh.userData.shadowApproximation='stochastic neutral transmission; no caustics';
}

export function maskInsertShadow(mesh){
  const enabled=mesh.material.userData.clearVariant;
  if(!enabled)throw Error('Missing physical variant mask');
  const m=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});
  m.onBeforeCompile=s=>{
    s.uniforms.clearInsertEnabled=enabled;
    s.vertexShader='attribute float paintClear;varying float vClearShadow;\n'+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvClearShadow=paintClear;');
    s.fragmentShader='uniform float clearInsertEnabled;varying float vClearShadow;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <alphatest_fragment>','#include <alphatest_fragment>\nif(clearInsertEnabled*vClearShadow>.5)discard;');
  };
  m.customProgramCacheKey=()=> 'physical-green-shadow-mask-v7';mesh.customDepthMaterial=m;
}
