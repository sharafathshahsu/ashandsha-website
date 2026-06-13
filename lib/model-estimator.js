// Lightweight 3D model parser + print-cost estimator.
// Supports STL (binary/ASCII), OBJ, and 3MF. No native dependencies
// (3MF uses the pure-JS `jszip` package to read the zip container,
// loaded lazily so STL/OBJ work even if jszip isn't installed).

/**
 * Signed volume of the tetrahedron formed by a triangle and the origin.
 * Summing this over every triangle of a closed mesh gives the mesh volume.
 */
function signedVolumeOfTriangle(p1, p2, p3) {
  const v321 = p3[0] * p2[1] * p1[2];
  const v231 = p2[0] * p3[1] * p1[2];
  const v312 = p3[0] * p1[1] * p2[2];
  const v132 = p1[0] * p3[1] * p2[2];
  const v213 = p2[0] * p1[1] * p3[2];
  const v123 = p1[0] * p2[1] * p3[2];
  return (1 / 6) * (-v321 + v231 + v312 - v132 - v213 + v123);
}

function newBoundsTracker() {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  return {
    add(p) {
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i];
        if (p[i] > max[i]) max[i] = p[i];
      }
    },
    result() { return { min, max }; },
  };
}

// ---- STL --------------------------------------------------------------

function parseBinarySTL(buffer) {
  const numTriangles = buffer.readUInt32LE(80);
  const expectedSize = 84 + numTriangles * 50;

  // Sanity check — if the size doesn't line up, this probably isn't binary.
  if (numTriangles <= 0 || expectedSize !== buffer.length) return null;

  const bounds = newBoundsTracker();
  let volume = 0;
  let offset = 84;
  let triangleCount = 0;

  for (let i = 0; i < numTriangles; i++) {
    offset += 12; // skip normal vector (3 floats)
    const verts = [];
    for (let j = 0; j < 3; j++) {
      const x = buffer.readFloatLE(offset);
      const y = buffer.readFloatLE(offset + 4);
      const z = buffer.readFloatLE(offset + 8);
      offset += 12;
      const p = [x, y, z];
      verts.push(p);
      bounds.add(p);
    }
    offset += 2; // skip attribute byte count
    volume += signedVolumeOfTriangle(verts[0], verts[1], verts[2]);
    triangleCount++;
  }

  return { volumeMm3: Math.abs(volume), bbox: bounds.result(), triangleCount };
}

function parseAsciiSTL(text) {
  const vertexRegex = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const bounds = newBoundsTracker();
  const verts = [];
  let match;
  while ((match = vertexRegex.exec(text)) !== null) {
    const p = [parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3])];
    verts.push(p);
    bounds.add(p);
  }

  if (verts.length < 3) return null;

  let volume = 0;
  for (let i = 0; i + 2 < verts.length; i += 3) {
    volume += signedVolumeOfTriangle(verts[i], verts[i + 1], verts[i + 2]);
  }

  return { volumeMm3: Math.abs(volume), bbox: bounds.result(), triangleCount: Math.floor(verts.length / 3) };
}

/**
 * Parse an STL file buffer and return its volume (mm^3) and bounding box.
 * Throws if the file doesn't look like a valid STL.
 */
function parseSTL(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 84) {
    throw new Error('File is too small to be a valid STL.');
  }

  // Binary STL is far more common from slicers/CAD exports — try it first.
  const binary = parseBinarySTL(buffer);
  if (binary) return binary;

  const ascii = parseAsciiSTL(buffer.toString('utf-8'));
  if (ascii) return ascii;

  throw new Error('Could not parse file as STL (binary or ASCII).');
}

// ---- OBJ ----------------------------------------------------------------

/**
 * Parse a Wavefront OBJ file. Reads `v` (vertex) and `f` (face) lines.
 * Faces with more than 3 vertices are fan-triangulated from the first vertex.
 */
function parseOBJ(buffer) {
  const text = buffer.toString('utf-8');
  const bounds = newBoundsTracker();
  const verts = [];
  let volume = 0;
  let triangleCount = 0;

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line[0] === '#') continue;

    if (line.startsWith('v ') || line.startsWith('v\t')) {
      const parts = line.split(/\s+/);
      const p = [parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])];
      if (p.every(Number.isFinite)) {
        verts.push(p);
        bounds.add(p);
      }
    } else if (line.startsWith('f ') || line.startsWith('f\t')) {
      const parts = line.split(/\s+/).slice(1);
      // Each token may be "v", "v/vt", "v/vt/vn", or "v//vn" — take the first index.
      const indices = parts.map(tok => {
        const idx = parseInt(tok.split('/')[0], 10);
        // OBJ indices are 1-based and may be negative (relative to end).
        return idx > 0 ? idx - 1 : verts.length + idx;
      });

      for (let i = 1; i + 1 < indices.length; i++) {
        const a = verts[indices[0]];
        const b = verts[indices[i]];
        const c = verts[indices[i + 1]];
        if (a && b && c) {
          volume += signedVolumeOfTriangle(a, b, c);
          triangleCount++;
        }
      }
    }
  }

  if (verts.length < 3 || triangleCount === 0) {
    throw new Error('Could not find any geometry in that OBJ file.');
  }

  return { volumeMm3: Math.abs(volume), bbox: bounds.result(), triangleCount };
}

// ---- 3MF ------------------------------------------------------------------

/**
 * Parse a 3MF file (a zip archive containing 3D/3dmodel.model, an XML mesh
 * description). Sums geometry across every <object><mesh> in the model.
 */
async function parse3MF(buffer) {
  let JSZip;
  try {
    JSZip = require('jszip');
  } catch (e) {
    throw new Error('3MF support is not available right now (missing jszip dependency).');
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    throw new Error('Could not open that file as a 3MF (zip) archive.');
  }

  // Modern slicers (BambuStudio, OrcaSlicer, PrusaSlicer, Anycubic Slicer, ...)
  // often export "production extension" 3MF files where the root
  // 3D/3dmodel.model is tiny and only references external part files such as
  // 3D/Objects/object_1.model via <component p:path="..."> / <item p:path="...">.
  // Rather than resolve those references, we scan EVERY *.model entry in the
  // archive and merge geometry from each <object><mesh> block we find — this
  // covers both simple single-file 3MFs and multi-part production-extension
  // 3MFs alike.
  const modelEntries = Object.values(zip.files).filter(f => /\.model$/i.test(f.name) && !f.dir);

  if (modelEntries.length === 0) {
    throw new Error('Could not find a 3D model inside that 3MF file.');
  }

  const bounds = newBoundsTracker();
  let volume = 0;
  let triangleCount = 0;
  let foundAny = false;

  for (const entry of modelEntries) {
    const xml = await entry.async('string');

    // Walk each <object>...<mesh>...</mesh>...</object> block independently so
    // multi-part 3MF files are combined into one bounding box / volume.
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
        const p = [parseFloat(vMatch[1]), parseFloat(vMatch[2]), parseFloat(vMatch[3])];
        verts.push(p);
        bounds.add(p);
      }

      const triangleRegex = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/gi;
      let tMatch;
      while ((tMatch = triangleRegex.exec(trianglesBlockMatch[1])) !== null) {
        const a = verts[parseInt(tMatch[1], 10)];
        const b = verts[parseInt(tMatch[2], 10)];
        const c = verts[parseInt(tMatch[3], 10)];
        if (a && b && c) {
          volume += signedVolumeOfTriangle(a, b, c);
          triangleCount++;
          foundAny = true;
        }
      }
    }
  }

  if (!foundAny) {
    throw new Error('Could not find any mesh geometry inside that 3MF file.');
  }

  return { volumeMm3: Math.abs(volume), bbox: bounds.result(), triangleCount };
}

/**
 * Parse a 3D model from its file extension. Returns { volumeMm3, bbox, triangleCount }.
 */
async function parseModel(buffer, originalName) {
  const ext = (originalName || '').toLowerCase().split('.').pop();
  if (ext === 'stl') return parseSTL(buffer);
  if (ext === 'obj') return parseOBJ(buffer);
  if (ext === '3mf') return parse3MF(buffer);
  throw new Error('Unsupported file type. Please upload an STL, OBJ, or 3MF file.');
}

// ---- Print cost estimation -------------------------------------------------

const MAX_BUILD_MM = 256; // max printable cube, mm per side

const MATERIALS = {
  PLA: { label: 'PLA', densityGcm3: 1.24, pricePerGram: 0.10 },
  PETG: { label: 'PETG', densityGcm3: 1.27, pricePerGram: 0.12 },
};

const DEFAULTS = {
  infill: 0.2,              // 20% infill
  shellFactor: 0.18,        // approx. fraction of bbox-filling volume used by shells/walls
  hourlyRate: 4.5,          // CAD per hour of machine time
  baseFee: 6,               // CAD flat fee per job (setup, post-processing)
  printSpeedCm3PerHour: 16, // rough volumetric throughput for a typical FDM printer
  minHours: 0.5,
  colorSwapFeePerColor: 3,  // CAD per extra colour beyond the first (manual filament swaps)
};

/**
 * Turn raw geometry stats into a rough quote. This is intentionally simple —
 * it's meant to give customers a ballpark, not a precise slicer-accurate quote.
 *
 * opts:
 *   - infill: fraction (0-1)
 *   - material: 'PLA' | 'PETG'
 *   - colorCount: 1-4 (number of filament colours, for multicolour prints)
 */
function estimateFromGeometry({ volumeMm3, bbox, triangleCount }, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  const materialKey = MATERIALS[cfg.material] ? cfg.material : 'PLA';
  const material = MATERIALS[materialKey];

  const colorCount = Math.min(4, Math.max(1, parseInt(cfg.colorCount, 10) || 1));

  const volumeCm3 = volumeMm3 / 1000;
  const dimsMm = {
    x: bbox.max[0] - bbox.min[0],
    y: bbox.max[1] - bbox.min[1],
    z: bbox.max[2] - bbox.min[2],
  };

  const oversized = [dimsMm.x, dimsMm.y, dimsMm.z].some(d => d > MAX_BUILD_MM);

  // Effective material volume: shells/walls regardless of infill, plus the
  // chosen infill percentage for the remaining interior volume.
  const effectiveVolumeCm3 = volumeCm3 * (cfg.shellFactor + cfg.infill * (1 - cfg.shellFactor));

  const weightGrams = effectiveVolumeCm3 * material.densityGcm3;
  const printHours = Math.max(cfg.minHours, effectiveVolumeCm3 / cfg.printSpeedCm3PerHour);

  const materialCost = weightGrams * material.pricePerGram;
  const timeCost = printHours * cfg.hourlyRate;
  const colorFee = (colorCount - 1) * cfg.colorSwapFeePerColor;
  const price = cfg.baseFee + materialCost + timeCost + colorFee;

  const breakdown = {
    baseFee: round(cfg.baseFee, 2),
    materialCost: round(materialCost, 2),
    timeCost: round(timeCost, 2),
  };
  if (colorFee > 0) breakdown.colorFee = round(colorFee, 2);

  return {
    dimensionsMm: { x: round(dimsMm.x, 1), y: round(dimsMm.y, 1), z: round(dimsMm.z, 1) },
    volumeCm3: round(volumeCm3, 2),
    weightGrams: round(weightGrams, 1),
    printHours: round(printHours, 1),
    triangleCount,
    price: round(price, 2),
    oversized,
    maxBuildMm: MAX_BUILD_MM,
    breakdown,
    settings: {
      infillPercent: Math.round(cfg.infill * 100),
      material: material.label,
      colorCount,
    },
  };
}

function round(n, digits) {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

module.exports = { parseSTL, parseOBJ, parse3MF, parseModel, estimateFromGeometry, MATERIALS, MAX_BUILD_MM };
