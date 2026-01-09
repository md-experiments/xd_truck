import './style.css';

import { Howl, Howler } from 'howler';
import * as RAPIER from '@dimforge/rapier3d-compat';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!canvas) {
  throw new Error('Missing canvas element');
}

const renderer = createRenderer(canvas);
const scene = new Scene();
scene.background = new Color('#0b0f14');

const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 12);

const ambient = new AmbientLight('#dfe9ff', 0.6);
scene.add(ambient);
const directional = new DirectionalLight('#ffffff', 1.1);
directional.position.set(6, 10, 4);
scene.add(directional);

const input = new TouchInputLayer({
  leftZone: document.querySelector('#left-stick') as HTMLElement,
  rightZone: document.querySelector('#right-stick') as HTMLElement
});

const compat = createCompatibilityReport();
updateCompatibilityUI(compat);

const engineSound = new Howl({
  src: [
    'data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQwAAAAA'
  ],
  loop: true,
  volume: 0.4
});
let audioUnlocked = false;
const unlockAudio = () => {
  if (audioUnlocked) {
    return;
  }
  audioUnlocked = true;
  engineSound.play();
  engineSound.volume(0);
  setTimeout(() => {
    engineSound.volume(0.4);
  }, 200);
  setTimeout(() => {
    updateCompatibilityUI({ ...compat, audioUnlock: 'Unlocked' });
  }, 0);
};

canvas.addEventListener('pointerdown', () => {
  unlockAudio();
});

await RAPIER.init();
const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });

const groundGeometry = new PlaneGeometry(60, 60);
const groundMaterial = new MeshStandardMaterial({ color: '#13202f' });
const groundMesh = new Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
scene.add(groundMesh);
const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.1, 30), groundBody);

const truckGeometry = new BoxGeometry(2.5, 1.5, 4);
const truckMaterial = new MeshStandardMaterial({ color: '#82a7ff' });
const truckMesh = new Mesh(truckGeometry, truckMaterial);
scene.add(truckMesh);
const truckBody = world.createRigidBody(
  RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 2, 0).setLinearDamping(2)
);
const truckCollider = world.createCollider(
  RAPIER.ColliderDesc.cuboid(1.2, 0.8, 1.8).setRestitution(0.1),
  truckBody
);
truckCollider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

setupGltf(scene, renderer).catch((error) => {
  console.warn('GLTF load failed, using procedural truck mesh instead.', error);
});

const clock = { last: performance.now() };

const tick = (time: number) => {
  const delta = Math.min((time - clock.last) / 1000, 0.033);
  clock.last = time;

  const steering = input.leftVector.x;
  const throttle = -input.rightVector.y;

  const forward = new Vector3(0, 0, -1).applyQuaternion(truckMesh.quaternion);
  const force = forward.multiplyScalar(throttle * 40);
  truckBody.applyForce({ x: force.x, y: 0, z: force.z }, true);

  const angular = steering * 1.4;
  truckBody.applyTorqueImpulse({ x: 0, y: angular, z: 0 }, true);

  world.timestep = delta;
  world.step();

  const translation = truckBody.translation();
  const rotation = truckBody.rotation();
  truckMesh.position.set(translation.x, translation.y, translation.z);
  truckMesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

  camera.position.lerp(new Vector3(0, 6, 12).add(truckMesh.position), 0.08);
  camera.lookAt(truckMesh.position.clone().add(new Vector3(0, 1, 0)));

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
};

requestAnimationFrame(tick);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

window.addEventListener('pointerdown', unlockAudio, { once: true });

function createRenderer(target: HTMLCanvasElement) {
  const context = target.getContext('webgl2', { antialias: true });
  const renderer = new WebGLRenderer({
    canvas: target,
    context: context ?? undefined,
    antialias: true
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer;
}

function createCompatibilityReport() {
  const webgl2 = !!document.createElement('canvas').getContext('webgl2');
  const wasm = typeof WebAssembly === 'object';
  const pointerEvents = 'PointerEvent' in window;
  const audioUnlock = Howler.ctx?.state === 'running' ? 'Unlocked' : 'Pending';
  return { webgl2, wasm, pointerEvents, audioUnlock };
}

function updateCompatibilityUI(report: {
  webgl2: boolean;
  wasm: boolean;
  pointerEvents: boolean;
  audioUnlock: string;
}) {
  const container = document.querySelector('#compat');
  if (!container) {
    return;
  }
  const items = [
    { label: 'WebGL2', value: report.webgl2 ? 'Supported' : 'Unavailable' },
    { label: 'WASM', value: report.wasm ? 'Supported' : 'Unavailable' },
    { label: 'Pointer Events', value: report.pointerEvents ? 'Supported' : 'Unavailable' },
    { label: 'Audio Unlock', value: report.audioUnlock }
  ];
  container.innerHTML = items
    .map(
      (item) =>
        `<div class="compat-item"><span>${item.label}</span><span>${item.value}</span></div>`
    )
    .join('');
}

async function setupGltf(targetScene: Scene, renderer: WebGLRenderer) {
  const loader = new GLTFLoader();
  const ktx2Loader = new KTX2Loader();
  ktx2Loader.setTranscoderPath('/basis/');
  ktx2Loader.detectSupport(renderer);
  loader.setKTX2Loader(ktx2Loader);
  const gltf = await loader.loadAsync('/assets/truck.glb');
  gltf.scene.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  gltf.scene.position.set(0, 0, 0);
  targetScene.add(gltf.scene);
}

class TouchInputLayer {
  leftVector = new Vector2();
  rightVector = new Vector2();
  #left: VirtualStick;
  #right: VirtualStick;

  constructor({ leftZone, rightZone }: { leftZone: HTMLElement; rightZone: HTMLElement }) {
    this.#left = new VirtualStick(leftZone, (value) => {
      this.leftVector.copy(value);
    });
    this.#right = new VirtualStick(rightZone, (value) => {
      this.rightVector.copy(value);
    });
  }
}

class VirtualStick {
  #zone: HTMLElement;
  #knob: HTMLElement;
  #onMove: (value: Vector2) => void;
  #activePointer: number | null = null;
  #center = new Vector2();
  #value = new Vector2();

  constructor(zone: HTMLElement, onMove: (value: Vector2) => void) {
    this.#zone = zone;
    const knob = zone.querySelector<HTMLElement>('.stick-knob');
    if (!knob) {
      throw new Error('Missing stick knob element');
    }
    this.#knob = knob;
    this.#onMove = onMove;

    zone.addEventListener('pointerdown', this.#handleDown);
    zone.addEventListener('pointermove', this.#handleMove);
    zone.addEventListener('pointerup', this.#handleUp);
    zone.addEventListener('pointercancel', this.#handleUp);
    zone.addEventListener('lostpointercapture', this.#handleUp);
  }

  #handleDown = (event: PointerEvent) => {
    if (this.#activePointer !== null) {
      return;
    }
    this.#activePointer = event.pointerId;
    this.#zone.setPointerCapture(event.pointerId);
    const rect = this.#zone.getBoundingClientRect();
    this.#center.set(rect.left + rect.width / 2, rect.top + rect.height / 2);
    this.#updateValue(event);
  };

  #handleMove = (event: PointerEvent) => {
    if (event.pointerId !== this.#activePointer) {
      return;
    }
    this.#updateValue(event);
  };

  #handleUp = (event: PointerEvent) => {
    if (event.pointerId !== this.#activePointer) {
      return;
    }
    this.#activePointer = null;
    this.#value.set(0, 0);
    this.#updateKnob();
    this.#onMove(this.#value.clone());
  };

  #updateValue(event: PointerEvent) {
    const maxRadius = this.#zone.clientWidth * 0.35;
    const offset = new Vector2(event.clientX - this.#center.x, event.clientY - this.#center.y);
    if (offset.length() > maxRadius) {
      offset.setLength(maxRadius);
    }
    this.#value.set(offset.x / maxRadius, offset.y / maxRadius);
    this.#updateKnob(offset);
    this.#onMove(this.#value.clone());
  }

  #updateKnob(offset = new Vector2()) {
    this.#knob.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0)`;
  }
}
