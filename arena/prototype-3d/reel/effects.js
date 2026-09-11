import * as THREE from 'three';
const colours={EAR:'#ff2010',KRE:'#16ff24',VRA:'#ffd510'};
export function createEffects(scene,camera,depth,w,h){
 const all=[];
 const material=(colour,style)=>{const m=new THREE.ShaderMaterial({transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,toneMapped:false,side:THREE.DoubleSide,uniforms:{colour:{value:new THREE.Color(colour)},strength:{value:1},style:{value:style},time:{value:0},age:{value:0},radius:{value:0},depthImage:{value:depth},resolution:{value:new THREE.Vector2(w,h)}},vertexShader:`varying vec2 vUv;varying vec3 viewPosition;void main(){vUv=uv;vec4 v=modelViewMatrix*vec4(position,1.);viewPosition=v.xyz;gl_Position=projectionMatrix*v;}`,fragmentShader:`
 varying vec2 vUv;varying vec3 viewPosition;uniform mat4 projectionMatrix;uniform vec3 colour;uniform float strength,time,age,radius;uniform int style;uniform sampler2D depthImage;uniform vec2 resolution;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 float fbm(vec2 p){return noise(p)*.57+noise(p*2.07)*.28+noise(p*4.13)*.15;}
 void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=0.;float frontDepth=gl_FragCoord.z;
 if(style==3||style==4){vec3 front=viewPosition;front.z+=radius*sqrt(max(0.,1.-r*r));vec4 clip=projectionMatrix*vec4(front,1.);frontDepth=clip.z/clip.w*.5+.5;}
 if(frontDepth>texture2D(depthImage,gl_FragCoord.xy/resolution).r+.000003)discard;
 vec3 c=colour;float n=fbm(p*5.+vec2(-time*3.,time*1.7));
 if(style==0){float d=abs(p.y);a=(1.-smoothstep(.35,1.,d));c=mix(colour,vec3(1.,.96,.83),1.-smoothstep(.0,.25,d));}
 if(style==1){float spike=exp(-abs(p.x)*80.)*pow(max(0.,1.-abs(p.y)),1.8)+exp(-abs(p.y)*80.)*pow(max(0.,1.-abs(p.x)),1.8);
  spike+=.35*(exp(-abs(p.x-p.y)*90.)+exp(-abs(p.x+p.y)*90.))*pow(max(0.,1.-r),2.);a=exp(-r*r*16.)*.38+spike+exp(-r*r*300.)*1.5;c=mix(colour,vec3(1.,.97,.8),exp(-r*r*180.));a*=.86+.14*sin(time*21.);}
 if(style==2){float ang=atan(p.y,p.x);float tongue=.08*sin(ang*9.+time*9.)+.07*sin(ang*15.-time*13.)+.06*sin(ang*5.+time*7.);float edge=.55+tongue+(n-.5)*.38;
  a=(1.-smoothstep(edge-.16,edge+.06,r))*(.48+.52*n);float hot=(1.-smoothstep(.08,.43,r))*(.6+.4*n);c=mix(colour*.7,vec3(.78,1.,.53),hot);a+=exp(-r*r*7.)*.10;}
 if(style==3){float edge=.86+(n-.5)*.18;float body=1.-smoothstep(edge-.13,edge+.04,r);a=body*pow(1.-age,.7)*(.8+.2*n)*1.5;float hot=clamp(1.-r*.85-age*.5,0.,1.);c=mix(vec3(1.,.19,.02),vec3(1.,.94,.67),hot);c=mix(c,vec3(1.),max(0.,1.-age*3.5));}
 if(style==4){float edge=1.-smoothstep(.78,1.,r);float ring=exp(-pow((r-.7)*12.,2.));a=edge*(.24+ring*.55)*(1.-age);c=vec3(.20,.62,1.);}
 if(style==5){a=(1.-smoothstep(0.,1.,abs(p.y)))*pow(vUv.x,1.1)*.65;c=mix(colour,vec3(1.),pow(vUv.x,12.)*.4);}
 gl_FragColor=vec4(c,max(0.,a*strength));}`});m.userData.register='energetic';return m;};
 function mesh(name,colour,style){const m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material(colour,style));m.name=name;m.userData.register='energetic';m.castShadow=m.receiveShadow=false;m.visible=false;scene.add(m);all.push(m);return m;}
 function ribbon(m,a,b,width){m.visible=true;const mid=a.clone().add(b).multiplyScalar(.5),dir=b.clone().sub(a),side=dir.clone().cross(camera.position.clone().sub(mid)).normalize().multiplyScalar(width/2),p=m.geometry.attributes.position;
  const points=[a.clone().add(side),b.clone().add(side),a.clone().sub(side),b.clone().sub(side)];points.forEach((v,i)=>p.setXYZ(i,v.x,v.y,v.z));p.needsUpdate=true;m.geometry.computeBoundingSphere();m.position.set(0,0,0);m.quaternion.identity();m.scale.setScalar(1);
  // Plane UV X follows the flight direction; Y is transverse beam width.
 }
 const beams=Array.from({length:8},(_,i)=>mesh('continuous beam '+i,'#ffffff',0));
 const stars=Array.from({length:3},(_,i)=>mesh('projectile '+i,'#ffffff',i===1?2:1));
 const trails=Array.from({length:3},(_,i)=>mesh('projectile trail '+i,'#ffffff',5));
 const bursts=Array.from({length:7},(_,i)=>mesh('hit flash and fireball '+i,'#ffad35',3));
 const shields=Array.from({length:4},(_,i)=>mesh('confirmed struck shield face '+i,'#60b8ff',4));
 const flameTails=Array.from({length:5},(_,i)=>mesh('plasma flame tongue '+i,'#16ff24',2));
 const setColour=(m,f)=>m.material.uniforms.colour.value.set(colours[f]);
 const billboard=(m,pos,size)=>{m.visible=true;m.position.copy(pos);m.quaternion.copy(camera.quaternion);m.scale.setScalar(size);m.material.uniforms.radius.value=size/2;};
 return {all,clear(t){for(const m of all){m.visible=false;m.material.uniforms.time.value=t;m.material.uniforms.age.value=0;m.material.uniforms.strength.value=1;}},
 beam(i,a,b,f,strength=1,width=.17){const m=beams[i];ribbon(m,a,b,width);setColour(m,f);m.material.uniforms.strength.value=strength;},
 projectile(i,pos,prior,f,t){const m=stars[i];setColour(m,f);billboard(m,pos,i===1?1.3:1.35);const tail=trails[i];setColour(tail,f);ribbon(tail,prior,pos,i===1?.28:.16);
  if(i===1)for(let j=0;j<5;j++){const p=pos.clone().lerp(prior,(j+1)*.095);p.y+=Math.sin(t*11+j*1.8)*.09;p.z+=Math.cos(t*9+j)*.08;const q=flameTails[j];billboard(q,p,.7-j*.07);q.material.uniforms.strength.value=.7-j*.08;}
 },burst(i,pos,age,size=.95){const m=bursts[i];billboard(m,pos,2*size*(.22+.78*Math.sqrt(age)));m.material.uniforms.age.value=age;},
 shield(i,pos,normal,age){const m=shields[i];billboard(m,pos.clone().addScaledVector(normal,.055),1.5);m.material.uniforms.age.value=age;},
 colours};
}
