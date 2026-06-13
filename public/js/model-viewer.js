// Lightweight 3D preview for the custom-order page.
// Loads STL / OBJ / 3MF files into a small three.js viewport and reports
// the model's bounding-box dimensions (mm) back to main.js.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { unzipSync, strFromU8 } from 'three/addons/libs/fflate.module.js';

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

// Parse a 3MF (zip) buffer by merging geometry from EVERY *.model entry in
// the archive — not just the root 3D/3dmodel.model. Modern slicers (Bambu
// Studio, OrcaSlicer, PrusaSlicer, Anycubic Slicer, ...) often export
// "production extension" 3MFs whose root model only references external part
// files (3D/Objects/object_N.model). three.js's ThreeMFLoader doesn't follow
// those references, so it renders nothing for these "complex" models. Scanning
// every *.model file directly works for both simple and multi-part 3MFs.
function parse3MFGeometry(buffer) {
  const zip = unzipSync(new Uint8Array(buffer));
  const positions = [];

  for (const name of Object.keys(zip)) {
    if (!/\.model$/i.test(name)) continue;
    const xml = strFromU8(zip[name]);

    const objectRegex = /<object\b[^>]*>([\s\S]*?)<\/object>/gi;
    let objMatch;
    while ((objMatch = objectRegex.exec(xml)) !== null) {
      const block = objMatch[1];

      const verticesBlockMatch = /<vertices>([\s\S]*?)<\/vertices>/i.exec(block);
      const trianglesBlockMatch = /<triangles>([\s\S]*?)<\/triangles>/i.exec(block);
      if (!verticesBlockMatch || !trianglesBlockMatch) continue;

      const verts = [];
      const vertexRegex = /<vertex\s+x="([-+0-9.eE]+)"\s+y="([-+0-9.eE]+)"\s+z="([-+0-9.eE]+)"\s*\/>/gi;
      let vMatch;
      while ((vMatch = vertexRegex.exec(verticesBlockMatch[1])) !== null) {
        verts.push([parseFloat(vMatch[1]), parseFloat(vMatch[2]), parseFloat(vMatch[3])]);
      }

      const triangleRegex = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/gi;
      let tMatch;
      while ((tMatch = triangleRegex.exec(trianglesBlockMatch[1])) !== null) {
        const a = verts[parseInt(tMatch[1], 10)];
        const b = verts[parseInt(tMatch[2], 10)];
        const c = verts[parseInt(tMatch[3], 10)];
        if (a && b && c) {
          positions.push(...a, ...b, ...c);
        }
      }
    }
  }

  if (positions.length === 0) {
    throw new Error('Could not find any mesh geometry inside that 3MF file.');
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
  geometry.computeVertexNormals();
  return geometry;
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
    object.traverse(o => {
      if (o.isMesh) {
        o.material = meshMaterial;
        if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      }
    });
  } else if (ext === '3mf') {
    const geometry = parse3MFGeometry(buffer);
    object = new THREE.Mesh(geometry, meshMaterial);
  } else {
    throw new Error('Unsupported file type for preview.');
  }

  currentObject = object;
  scene.add(object);
  resize();
  return frame(object);
}

window.ModelViewer = { init, loadFile, clear, resize };
