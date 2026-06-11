// Lightweight STL parser + print-cost estimator.
// Supports both binary and ASCII STL files. No external dependencies.

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

function parseBinarySTL(buffer) {
    const numTriangles = buffer.readUInt32LE(80);
    const expectedSize = 84 + numTriangles * 50;

  // Sanity check — if the size doesn't line up, this probably isn't binary.
  if (numTriangles <= 0 || expectedSize !== buffer.length) return null;

  const bounds = newBoundsTracker();
    let volume = 0;
    let offset = 84;

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
  }

  return { volumeMm3: Math.abs(volume), bbox: bounds.result(), triangleCount: numTriangles };
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

// ---- Print cost estimation -------------------------------------------------

const DEFAULTS = {
    densityGcm3: 1.24,        // PLA density (g/cm^3)
    infill: 0.2,              // 20% infill
    shellFactor: 0.18,        // approx. fraction of bbox-filling volume used by shells/walls
    pricePerGram: 0.10,       // CAD per gram of filament
    hourlyRate: 4.5,          // CAD per hour of machine time
    baseFee: 6,               // CAD flat fee per job (setup, post-processing)
    printSpeedCm3PerHour: 16, // rough volumetric throughput for a typical FDM printer
    minHours: 0.5,
};

/**
 * Turn raw geometry stats into a rough quote. This is intentionally simple —
 * it's meant to give customers a ballpark, not a precise slicer-accurate quote.
 */
function estimateFromGeometry({ volumeMm3, bbox, triangleCount }, opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };

  const volumeCm3 = volumeMm3 / 1000;
    const dimsMm = {
          x: bbox.max[0] - bbox.min[0],
          y: bbox.max[1] - bbox.min[1],
          z: bbox.max[2] - bbox.min[2],
    };

  // Effective material volume: shells/walls regardless of infill, plus the
  // chosen infill percentage for the remaining interior volume.
  const effectiveVolumeCm3 = volumeCm3 * (cfg.shellFactor + cfg.infill * (1 - cfg.shellFactor));

  const weightGrams = effectiveVolumeCm3 * cfg.densityGcm3;
    const printHours = Math.max(cfg.minHours, effectiveVolumeCm3 / cfg.printSpeedCm3PerHour);

  const materialCost = weightGrams * cfg.pricePerGram;
    const timeCost = printHours * cfg.hourlyRate;
    const price = cfg.baseFee + materialCost + timeCost;

  return {
        dimensionsMm: dimsMm,
        volumeCm3: round(volumeCm3, 2),
        weightGrams: round(weightGrams, 1),
        printHours: round(printHours, 1),
        triangleCount,
        price: round(price, 2),
        breakdown: {
                baseFee: round(cfg.baseFee, 2),
                materialCost: round(materialCost, 2),
                timeCost: round(timeCost, 2),
        },
        settings: {
                infillPercent: Math.round(cfg.infill * 100),
                material: 'PLA',
        },
  };
}

function round(n, digits) {
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
}

module.exports = { parseSTL, estimateFromGeometry };
