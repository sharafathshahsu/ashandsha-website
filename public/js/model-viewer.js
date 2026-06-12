// Lightweight 3D preview for the custom-order page.
// Loads STL / OBJ / 3MF files into a small three.js viewport and reports
// the model's bounding-box dimensions (mm) back to main.js.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

let scene, camera, renderer, controls, currentObject, container, canvasEl, ready = false;

const meshMaterial = new THREE.MeshStandardMaterial({
    color: 0xff5a36,
    metalness: 0.05,
    roughness: 0.55,
});

function init(canvas) {
    if (ready) return;
    canvasEl = canvas;
    container = canvas.parentElement;

  scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f1ec);

  camera = new THREE.PerspectiveCamera(45, sizeOf().w / sizeOf().h, 0.1, 100000);
    camera.position.set(80, 60, 80);

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.4));
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(1, 2, 3);
    scene.add(dir);

  const grid = new THREE.GridHelper(300, 12, 0xcccccc, 0xe4e0d8);
    scene.add(grid);

  controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

  resize();
    window.addEventListener('resize', resize);
    ready = true;
    animate();
}

function sizeOf() {
    if (!container) return { w: 300, h: 300 };
    return { w: container.clientWidth || 300, h: container.clientHeight || 300 };
}

function resize() {
    if (!renderer || !camera) return;
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

function clear() {
    if (currentObject) {
          scene.remove(currentObject);
          currentObject.traverse(o => {
                  if (o.geometry) o.geometry.dispose();
          });
          currentObject = null;
    }
}

function frame(object) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 1.6;
    camera.position.set(dist, dist * 0.75, dist);
    camera.near = Math.max(maxDim / 100, 0.01);
    camera.far = maxDim * 100;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();

  return { x: size.x, y: size.y, z: size.z };
}

async function loadFile(file) {
    if (!ready) throw new Error('Viewer not initialized.');
    clear();

  const ext = file.name.toLowerCase().split('.').pop();
    const buffer = await file.arrayBuffer();
    let object;

  if (ext === 'stl') {
        const geometry = new STLLoader().parse(buffer);
        geometry.computeVertexNormals();
        object = new THREE.Mesh(geometry, meshMaterial);
  } else if (ext === 'obj') {
        const text = new TextDecoder().decode(buffer);
        object = new OBJLoader().parse(text);
        object.traverse(o => { if (o.isMesh) o.material = meshMaterial; });
  } else if (ext === '3mf') {
        object = new ThreeMFLoader().parse(buffer);
        object.traverse(o => { if (o.isMesh) o.material = meshMaterial; });
  } else {
        throw new Error('Unsupported file type for preview.');
  }

  currentObject = object;
    scene.add(object);
    resize();
    return frame(object);
}

window.ModelViewer = { init, loadFile, clear, resize };
