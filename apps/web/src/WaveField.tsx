import { Component, useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Wave } from './api';
const palette=['#d5fc50','#c7b8ff','#ff805d','#7bd5e7','#ffa1cd','#89dab4'];
const vertex=`uniform float uTime; uniform float uPulse; varying vec3 vNormal; varying vec3 vPosition;
void main(){vec3 n=normalize(position);float wobble=sin(n.x*5.+uTime*.8)*cos(n.y*4.-uTime*.6)*sin(n.z*4.+uTime*.4);vec3 p=position*(1.+wobble*.13+uPulse*.055);vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(p,1.);vPosition=mv.xyz;gl_Position=projectionMatrix*mv;}`;
const fragment=`uniform vec3 uColor;uniform float uTime;varying vec3 vNormal;varying vec3 vPosition;
void main(){vec3 n=normalize(vNormal);vec3 view=normalize(-vPosition);float facing=max(dot(n,view),0.);float rim=pow(1.-facing,2.2);float light=max(dot(n,normalize(vec3(-.5,.8,1.))),0.);float bands=sin((vPosition.y+vPosition.x*.2)*23.+uTime)*.5+.5.;vec3 c=uColor*(.17+light*.64)+vec3(.76,.8,.5)*pow(light,22.)+uColor*rim*1.5; c+=uColor*bands*.10;gl_FragColor=vec4(c,.94);}`;
function Orb({x,y,size,color,beat}:{x:number;y:number;size:number;color:string;beat?:React.RefObject<number>}){
 const mesh=useRef<THREE.Mesh>(null);const group=useRef<THREE.Group>(null);const {viewport}=useThree();
 const uniforms=useMemo(()=>({uTime:{value:0},uPulse:{value:0},uColor:{value:new THREE.Color(color)}}),[color]);
 useFrame(({clock})=>{const t=clock.getElapsedTime();uniforms.uTime.value=t;uniforms.uPulse.value=beat?.current??0;if(mesh.current){mesh.current.rotation.y=t*.08;mesh.current.rotation.z=Math.sin(t*.25+x*4)*.1;}if(group.current)group.current.rotation.z=Math.sin(t*.15+x)*.18;});
 const radius=Math.min(viewport.width,viewport.height)*size;
 return <group ref={group} position={[(x-.5)*viewport.width,(.5-y)*viewport.height,0]}><mesh ref={mesh}><sphereGeometry args={[radius,48,40]}/><shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} transparent/></mesh>{[0,1,2].map(i=><mesh key={i} rotation={[.8+i*.7,i*.6,.4]}><torusGeometry args={[radius*(1.10+i*.055),radius*.009,6,96]}/><meshBasicMaterial color={color} transparent opacity={.35-i*.06}/></mesh>)}</group>;
}
class GraphicsBoundary extends Component<{children:ReactNode;fallback:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?this.props.fallback:this.props.children;}}
export function WaveField({waves,limit=12,stage=false,beat}:{waves:Wave[];limit?:number;stage?:boolean;beat?:React.RefObject<number>}){
 const [reduced,setReduced]=useState(false);useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setReduced(media.matches);sync();media.addEventListener('change',sync);return()=>media.removeEventListener('change',sync);},[]);
 const shown=waves.slice(0,limit);const n=shown.length||1;const columns=n===1?1:n<=4?2:n<=9?3:4;const rows=Math.ceil(n/columns);
 const orbs=(shown.length?shown:[null]).map((wave,i)=>({wave,x:((i%columns)+.5)/columns,y:(Math.floor(i/columns)+.5)/rows,size:Math.min(.34/Math.max(rows,1),.37/Math.max(columns*.64,1))*(wave?.votes&&shown[0]?.votes?.valueOf()?(.77+.23*Math.sqrt(wave.votes/shown[0].votes)):1),color:palette[i%palette.length]}));
 const fallback=<div className="orb-fallback">{orbs.map((o,i)=><i key={i} style={{left:o.x*100+'%',top:o.y*100+'%',width:`${Math.max(12,o.size*130)}%`,background:`radial-gradient(circle at 35% 20%,${o.color},${o.color}55 45%,#111 80%)`,boxShadow:`0 0 55px ${o.color}25`}}/>)}</div>;
 return <div className={'wave-field '+(stage?'stage-field':'')} aria-label={shown.length?'Live Sound Waves visualization':'Waiting for the first Sound Wave'}>
  <div className="field-grid"/>{reduced?fallback:<GraphicsBoundary fallback={fallback}><Canvas dpr={[1,1.5]} camera={{position:[0,0,10],fov:45}} gl={{alpha:true,antialias:true,powerPreference:'low-power'}} aria-hidden="true">{orbs.map((o,i)=><Orb key={o.wave?.id??i} {...o} beat={beat}/>)}</Canvas></GraphicsBoundary>}
  <div className="wave-labels">{orbs.map((o,i)=><div className="wave-label" key={o.wave?.id??i} style={{left:o.x*100+'%',top:o.y*100+'%'}}>{o.wave?<><span className="wave-rank">{String(i+1).padStart(2,'0')}</span><strong>{o.wave.text}</strong><small>{o.wave.votes} {o.wave.votes===1?'point':'points'} · {o.wave.name}</small></>:<><span className="wave-rank">MAKE THE FIRST MOVE</span><strong>A little idea.<br/>A whole new sound.</strong></>}</div>)}</div>
 </div>;
}
