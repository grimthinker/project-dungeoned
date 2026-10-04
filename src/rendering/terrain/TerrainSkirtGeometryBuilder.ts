import * as THREE from 'three';
import { TerrainData } from '../../types';
import { getTerrainHeightAt } from '../../utils';
import { TERRAIN_CONFIG } from '../../config/terrainConfig';

function calculateHillHeight(x: number, z: number, distFromBorder: number): number {
  const cfg = TERRAIN_CONFIG.skirt;
  const weight = Math.min(1.0, Math.max(0.0, distFromBorder / cfg.edgeBlendDistance));
  const t = weight * weight * (3 - 2 * weight);

  const distFactor = Math.min(1.0, distFromBorder / (cfg.distance * 0.8));
  const maxH = 12.0 + distFactor * (cfg.maxElevation - 12.0);

  const s = cfg.hillNoiseScale;
  const n1 = Math.sin(x * s + 1.2) * Math.cos(z * s + 2.3);
  const n2 = Math.sin(x * s * 2.4 - 0.7) * Math.sin(z * s * 2.4 + 1.1) * 0.5;
  const n3 = Math.cos(x * s * 5.1 + 3.1) * Math.cos(z * s * 4.9 - 1.9) * 0.25;

  const ridge = 1.0 - Math.abs(Math.sin(x * s * 1.5 + z * s * 1.2));
  const ridgeH = ridge * ridge * 0.65;

  const raw = (n1 + n2 + n3 + ridgeH + 1.0) * 0.45;
  const h = Math.max(0.0, raw) * maxH;

  return h * t;
}

export class TerrainSkirtGeometryBuilder {
  public static buildGeometry(terrainComp: TerrainData): THREE.BufferGeometry {
    const cfg = TERRAIN_CONFIG.skirt;
    const segments = cfg.segments;
    const rings = cfg.rings;
    const halfW = terrainComp.width / 2;
    const halfD = terrainComp.depth / 2;
    const skirtDist = cfg.distance;
    const distPower = cfg.distributionPower;
    const underlap = 1.8; // Ширина подвернутого пояса под террейн (в метрах)

    // rings колец вовне + 1 подвернутое кольцо нахлеста внутри террейна
    const totalRingRows = rings + 2;
    const totalVerts = (segments + 1) * totalRingRows;
    const positions = new Float32Array(totalVerts * 3);
    const uvs = new Float32Array(totalVerts * 2);

    const totalQuads = segments * (rings + 1);
    const indices = new Uint32Array(totalQuads * 6);

    let vPtr = 0;
    let uvPtr = 0;

    for (let j = 0; j < totalRingRows; j++) {
      const isUnderlapRing = j === 0;
      const isBorderRing = j === 1;

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const absCos = Math.max(1e-5, Math.abs(cosA));
        const absSin = Math.max(1e-5, Math.abs(sinA));
        const tBorder = Math.min(halfW / absCos, halfD / absSin);

        const x0 = cosA * tBorder;
        const z0 = sinA * tBorder;

        let x = x0;
        let z = z0;
        let y = 0;
        let dist = 0;

        const clampX0 = Math.max(-halfW + 0.01, Math.min(halfW - 0.01, x0));
        const clampZ0 = Math.max(-halfD + 0.01, Math.min(halfD - 0.01, z0));
        const edgeH = getTerrainHeightAt(terrainComp, clampX0, clampZ0) ?? 0;

        if (isUnderlapRing) {
          // Кольцо 0: заходит на 1.8м под террейн и утапливается на 4 см ниже поверхности
          x = x0 - cosA * underlap;
          z = z0 - sinA * underlap;
          const cx = Math.max(-halfW + 0.01, Math.min(halfW - 0.01, x));
          const cz = Math.max(-halfD + 0.01, Math.min(halfD - 0.01, z));
          y = (getTerrainHeightAt(terrainComp, cx, cz) ?? edgeH) - 0.04;
          dist = -underlap;
        } else if (isBorderRing) {
          // Кольцо 1: лежит строго на внешней кромке террейна
          x = x0;
          z = z0;
          y = edgeH;
          dist = 0;
        } else {
          // Кольца 2..N: радиальное расширение в горизонт до 1500м
          const u = (j - 1) / rings;
          dist = skirtDist * Math.pow(u, distPower);
          x = x0 + cosA * dist;
          z = z0 + sinA * dist;

          const edgeBlend = Math.max(0.0, 1.0 - dist / cfg.edgeBlendDistance);
          const smoothEdge = edgeBlend * edgeBlend * (3 - 2 * edgeBlend);
          const hillY = calculateHillHeight(x, z, dist);
          y = edgeH * smoothEdge + hillY;
        }

        positions[vPtr] = x;
        positions[vPtr + 1] = y;
        positions[vPtr + 2] = z;

        uvs[uvPtr] = i / segments;
        uvs[uvPtr + 1] = dist;

        vPtr += 3;
        uvPtr += 2;
      }
    }

    let iPtr = 0;
    const ringStride = segments + 1;
    for (let j = 0; j < rings + 1; j++) {
      for (let i = 0; i < segments; i++) {
        const i0 = j * ringStride + i;
        const i1 = i0 + 1;
        const i2 = (j + 1) * ringStride + i;
        const i3 = i2 + 1;

        indices[iPtr++] = i0;
        indices[iPtr++] = i1;
        indices[iPtr++] = i2;

        indices[iPtr++] = i1;
        indices[iPtr++] = i3;
        indices[iPtr++] = i2;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    return geometry;
  }

  public static updateEdgeHeights(geometry: THREE.BufferGeometry, terrainComp: TerrainData): void {
    const posAttr = geometry.attributes.position;
    const cfg = TERRAIN_CONFIG.skirt;
    const segments = cfg.segments;
    const rings = cfg.rings;
    const halfW = terrainComp.width / 2;
    const halfD = terrainComp.depth / 2;
    const skirtDist = cfg.distance;
    const distPower = cfg.distributionPower;
    const underlap = 1.8;

    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const absCos = Math.max(1e-5, Math.abs(cosA));
      const absSin = Math.max(1e-5, Math.abs(sinA));
      const tBorder = Math.min(halfW / absCos, halfD / absSin);

      const x0 = cosA * tBorder;
      const z0 = sinA * tBorder;

      const clampX0 = Math.max(-halfW + 0.01, Math.min(halfW - 0.01, x0));
      const clampZ0 = Math.max(-halfD + 0.01, Math.min(halfD - 0.01, z0));
      const edgeH = getTerrainHeightAt(terrainComp, clampX0, clampZ0) ?? 0;

      // 1. Обновление подвернутого внутреннего кольца (j = 0)
      const vIdx0 = 0 * (segments + 1) + i;
      const xIn = x0 - cosA * underlap;
      const zIn = z0 - sinA * underlap;
      const cx = Math.max(-halfW + 0.01, Math.min(halfW - 0.01, xIn));
      const cz = Math.max(-halfD + 0.01, Math.min(halfD - 0.01, zIn));
      const inH = (getTerrainHeightAt(terrainComp, cx, cz) ?? edgeH) - 0.04;
      posAttr.setY(vIdx0, inH);

      // 2. Обновление линии кромки террейна (j = 1)
      const vIdx1 = 1 * (segments + 1) + i;
      posAttr.setY(vIdx1, edgeH);

      // 3. Обновление внешних колец перехода в холмы (j >= 2)
      for (let j = 2; j <= rings + 1; j++) {
        const u = (j - 1) / rings;
        const dist = skirtDist * Math.pow(u, distPower);
        if (dist > cfg.edgeBlendDistance) break;

        const vIdx = j * (segments + 1) + i;
        const x = x0 + cosA * dist;
        const z = z0 + sinA * dist;

        const edgeBlend = Math.max(0.0, 1.0 - dist / cfg.edgeBlendDistance);
        const smoothEdge = edgeBlend * edgeBlend * (3 - 2 * edgeBlend);
        const hillY = calculateHillHeight(x, z, dist);
        const y = edgeH * smoothEdge + hillY;

        posAttr.setY(vIdx, y);
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  }
}
