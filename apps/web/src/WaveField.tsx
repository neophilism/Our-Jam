import { useMemo, useRef, useEffect, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { VisualOrb } from "./Visual";
const vertex = `uniform float uTime; uniform float uPulse; varying vec3 vNormal; varying vec3 vPosition;
void main(){vec3 n=normalize(position);float wobble=sin(n.x*5.+uTime*.8)*cos(n.y*4.-uTime*.6)*sin(n.z*4.+uTime*.4);vec3 p=position*(1.+wobble*.13+uPulse*.055);vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(p,1.);vPosition=mv.xyz;gl_Position=projectionMatrix*mv;}`;
const fragment = `uniform vec3 uColor;uniform float uTime;varying vec3 vNormal;varying vec3 vPosition;
void main(){vec3 n=normalize(vNormal);vec3 view=normalize(-vPosition);float facing=max(dot(n,view),0.);float rim=pow(1.-facing,2.2);float light=max(dot(n,normalize(vec3(-.5,.8,1.))),0.);float bands=sin((vPosition.y+vPosition.x*.2)*23.+uTime)*0.5+0.5;vec3 c=uColor*(.17+light*.64)+vec3(.76,.8,.5)*pow(light,22.)+uColor*rim*1.5; c+=uColor*bands*.10;gl_FragColor=vec4(c,.94);}`;
function Orb({
  x,
  y,
  size,
  color,
  beat,
  economy,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
  beat?: RefObject<number>;
  economy: boolean;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const target = useMemo(
    () =>
      new THREE.Vector3(
        (x - 0.5) * viewport.width,
        (0.5 - y) * viewport.height,
        0,
      ),
    [x, y, viewport.width, viewport.height],
  );
  const initialized = useRef(false);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    }),
    [color],
  );
  useFrame(({ clock }, delta) => {
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    uniforms.uPulse.value = beat?.current ?? 0;
    if (mesh.current) {
      mesh.current.rotation.y = t * 0.08;
      mesh.current.rotation.z = Math.sin(t * 0.25 + x * 4) * 0.1;
    }
    if (group.current) {
      group.current.rotation.z = Math.sin(t * 0.15 + x) * 0.18;
      if (!initialized.current) {
        group.current.position.copy(target);
        group.current.scale.setScalar(radius);
        initialized.current = true;
      }
      group.current.position.lerp(target, 1 - Math.exp(-delta * 5));
      group.current.scale.setScalar(
        THREE.MathUtils.lerp(
          group.current.scale.x,
          radius,
          1 - Math.exp(-delta * 4),
        ),
      );
    }
  });
  const radius = Math.min(viewport.width, viewport.height) * size;
  return (
    <group ref={group}>
      <mesh
        ref={mesh}
        onAfterRender={(renderer) => {
          if (!renderer.domElement.dataset.rendered)
            renderer.domElement.dataset.rendered = "true";
        }}
      >
        <sphereGeometry args={economy ? [1, 24, 20] : [1, 48, 40]} />
        <shaderMaterial
          vertexShader={vertex}
          fragmentShader={fragment}
          uniforms={uniforms}
          transparent
        />
      </mesh>
      {(economy ? [0] : [0, 1, 2]).map((i) => (
        <mesh key={i} rotation={[0.8 + i * 0.7, i * 0.6, 0.4]}>
          <torusGeometry
            args={[1.1 + i * 0.055, 0.009, 6, economy ? 48 : 96]}
          />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.35 - i * 0.06}
          />
        </mesh>
      ))}
    </group>
  );
}

function SceneClock({
  visible,
  economy,
  onFailure,
}: {
  visible: boolean;
  economy: boolean;
  onFailure: () => void;
}) {
  const { invalidate, gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const failed = () => onFailure();
    canvas.addEventListener("webglcontextlost", failed);
    return () => canvas.removeEventListener("webglcontextlost", failed);
  }, [gl, onFailure]);
  useEffect(() => {
    if (!visible || !economy) return;
    const timer = setInterval(invalidate, 1000 / 30);
    return () => clearInterval(timer);
  }, [visible, economy, invalidate]);
  return null;
}
export function WaveField({
  orbs,
  beat,
  visible,
  economy,
  onFailure,
}: {
  orbs: VisualOrb[];
  beat?: RefObject<number>;
  visible: boolean;
  economy: boolean;
  onFailure: () => void;
}) {
  return (
    <Canvas
      style={{ position: "absolute", inset: 0 }}
      dpr={economy ? 1 : [1, 1.5]}
      frameloop={!visible ? "never" : economy ? "demand" : "always"}
      camera={{ position: [0, 0, 10], fov: 45 }}
      gl={{ alpha: true, antialias: !economy, powerPreference: "low-power" }}
      aria-hidden="true"
    >
      <SceneClock visible={visible} economy={economy} onFailure={onFailure} />
      {orbs.map((orb, i) => (
        <Orb key={orb.wave?.id ?? i} {...orb} beat={beat} economy={economy} />
      ))}
    </Canvas>
  );
}
