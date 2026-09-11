import * as THREE from 'three';
// Same physical-depth / separately additive composite as the approved board.
export function pipeline(renderer,w,h){
 const options={type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter};
 const physical=new THREE.WebGLRenderTarget(w,h,options);physical.depthTexture=new THREE.DepthTexture(w,h,THREE.UnsignedIntType);
 const energy=new THREE.WebGLRenderTarget(w,h,{...options,depthBuffer:false});
 const blurH=new THREE.WebGLRenderTarget(w/2,h/2,{...options,depthBuffer:false}),blurV=blurH.clone();
 const scene=new THREE.Scene(),camera=new THREE.Camera(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));quad.frustumCulled=false;scene.add(quad);
 const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
 const blur=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,vertexShader,uniforms:{image:{value:energy.texture},stepSize:{value:new THREE.Vector2()}},fragmentShader:`uniform sampler2D image;uniform vec2 stepSize;varying vec2 vUv;
 void main(){gl_FragColor=texture2D(image,vUv)*.4+(texture2D(image,vUv+stepSize)+texture2D(image,vUv-stepSize))*.24+(texture2D(image,vUv+stepSize*2.)+texture2D(image,vUv-stepSize*2.))*.06;}`});
 const composite=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,vertexShader,uniforms:{base:{value:physical.texture},energy:{value:energy.texture},bloom:{value:blurV.texture},depth:{value:physical.depthTexture},pixels:{value:new THREE.Vector2(1/w,1/h)},blur:{value:0},focus:{value:40},inverseVP:{value:new THREE.Matrix4()}},fragmentShader:`uniform sampler2D base,energy,bloom,depth;uniform vec2 pixels;uniform float blur,focus;uniform mat4 inverseVP;varying vec2 vUv;
 float metres(float d){return 250./(250.-d*249.);}
 void main(){float d=texture2D(depth,vUv).r;vec4 world=inverseVP*vec4(vUv*2.-1.,d*2.-1.,1.);world/=world.w;
 // Tilted focus plane through the miniatures, rather than focusing empty board
 // between widely spaced ships. The approved camera pose and blur cap stay intact.
 float coc=clamp((abs(world.y-4.8)-.85)/3.,0.,1.)*blur;vec2 s=coc*pixels*.70710678;vec3 c=texture2D(base,vUv).rgb*.25;
 c+=(texture2D(base,vUv+vec2(s.x,0)).rgb+texture2D(base,vUv-vec2(s.x,0)).rgb+texture2D(base,vUv+vec2(0,s.y)).rgb+texture2D(base,vUv-vec2(0,s.y)).rgb)*.125;
 c+=(texture2D(base,vUv+s).rgb+texture2D(base,vUv-s).rgb+texture2D(base,vUv+vec2(s.x,-s.y)).rgb+texture2D(base,vUv+vec2(-s.x,s.y)).rgb)*.0625;
 c+=texture2D(energy,vUv).rgb+min(texture2D(bloom,vUv).rgb*.18,vec3(.18));gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
 }`});
 const screen=m=>{quad.material=m;renderer.render(scene,camera);};
 return {physical,energy,composite,render(physicalScene,energyScene,view,enabled=true){
  renderer.info.reset();renderer.setRenderTarget(physical);renderer.setClearColor(physicalScene.background,1);renderer.clear();renderer.render(physicalScene,view);
  renderer.setRenderTarget(energy);renderer.setClearColor(0,0);renderer.clear();if(enabled)renderer.render(energyScene,view);
  renderer.setRenderTarget(blurH);blur.uniforms.image.value=energy.texture;blur.uniforms.stepSize.value.set(2/w,0);screen(blur);
  renderer.setRenderTarget(blurV);blur.uniforms.image.value=blurH.texture;blur.uniforms.stepSize.value.set(0,4/h);screen(blur);
  renderer.setRenderTarget(null);screen(composite);
 },pixels(target=physical){const b=new Uint16Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,b);return b;}};
}
