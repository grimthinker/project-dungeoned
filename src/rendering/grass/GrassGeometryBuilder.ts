import * as THREE from 'three';
import { GRASS_CONFIG } from '../../config/grassConfig';
import { FLOWER_BY_VARIANT, FoliageVariant } from './GrassVariants';

export interface GrassClusterOptions {
  bladeCount?: number;
  segments?: number;
  height?: number;
  baseWidth?: number;
  tipWidth?: number;
  curveStrength?: number;
  rootRadius?: number;
  rootColor?: THREE.Color;
  tipColor?: THREE.Color;
  gradientPower?: number;
}

export type FlowerType = 'poppy' | 'cornflower' | 'daisy' | 'dandelion';

/**
 * Вес изгиба для стебля и всего соцветия цветка (общий на оба).
 *
 * uv.y в геометрии травы — это не текстурная координата, а ПРОФИЛЬ ИЗГИБА:
 * вершинный шейдер крутит каждую вершину вокруг корня на угол
 * `bendAngle * uv.y`. Поэтому у соцветия значение должно совпадать с профилем
 * верха стебля: иначе лепестки выгибаются сильнее стебля, отрываются от него
 * и сминаются в лепёшку при приминании существом.
 */
const FLOWER_BEND_WEIGHT = 0.5;

export class GrassGeometryBuilder {
  /** Обычный зеленый пучок травы */
  public static createClusterGeometry(options: GrassClusterOptions = {}): THREE.BufferGeometry {
    const bladeCount = Math.max(1, options.bladeCount ?? 4);
    const segments = Math.max(1, options.segments ?? 3);
    const height = options.height ?? 0.72;
    const baseWidth = options.baseWidth ?? 0.1;
    const tipWidth = options.tipWidth ?? 0.015;
    const curveStrength = options.curveStrength ?? 0.17;
    const rootRadius = options.rootRadius ?? 0.04;

    const rootColor = options.rootColor ?? new THREE.Color(0x3e732e);
    const tipColor = options.tipColor ?? new THREE.Color(0x7ec842);
    const gradientPower = options.gradientPower ?? 0.9;

    return GrassGeometryBuilder.generateBladeGeometry(
      bladeCount,
      segments,
      height,
      baseWidth,
      tipWidth,
      curveStrength,
      rootRadius,
      rootColor,
      tipColor,
      gradientPower
    );
  }

  /**
   * Геометрия дальнего LOD для конкретного вида растительности.
   *
   * Принцип: упрощается только стоимость, но НЕ силуэт и НЕ цвет — высота,
   * ширина, радиус корня и палитра берутся из тех же параметров, что и у полной
   * геометрии. Поэтому переключение LOD не читается на экране (важно, потому
   * что LOD выбирается для отдельных инстансов в полосе перехода).
   */
  public static createLowDetailGeometry(variant: FoliageVariant): THREE.BufferGeometry {
    switch (variant) {
      case 'grass3':
      case 'grass4':
      case 'grass5':
      case 'dryGrass':
        return GrassGeometryBuilder.createLowBladeGeometry(variant);
      case 'wheat':
        return GrassGeometryBuilder.createLowWheatGeometry();
      case 'reeds':
        return GrassGeometryBuilder.createLowReedsGeometry();
      default:
        return GrassGeometryBuilder.createLowFlowerGeometry(FLOWER_BY_VARIANT[variant]);
    }
  }

  /**
   * Параметры пучковых вариантов. Значения намеренно совпадают с дефолтами
   * `createClusterGeometry` и с аргументами `createDryGrassGeometry` —
   * от них зависит бесшовность перехода полная геометрия -> упрощенная.
   */
  private static bladeParamsFor(variant: FoliageVariant): {
    bladeCount: number;
    height: number;
    baseWidth: number;
    tipWidth: number;
    curveStrength: number;
    rootRadius: number;
    rootColor: THREE.Color;
    tipColor: THREE.Color;
    gradientPower: number;
  } {
    switch (variant) {
      case 'grass3':
        return {
          bladeCount: 3,
          height: GRASS_CONFIG.heights.blade3,
          baseWidth: 0.1,
          tipWidth: 0.015,
          curveStrength: 0.17,
          rootRadius: 0.04,
          rootColor: new THREE.Color(0x3e732e),
          tipColor: new THREE.Color(0x7ec842),
          gradientPower: 0.9,
        };
      case 'grass4':
        return {
          bladeCount: 4,
          height: GRASS_CONFIG.heights.blade4,
          baseWidth: 0.1,
          tipWidth: 0.015,
          curveStrength: 0.17,
          rootRadius: 0.04,
          rootColor: new THREE.Color(0x3e732e),
          tipColor: new THREE.Color(0x7ec842),
          gradientPower: 0.9,
        };
      case 'grass5':
        return {
          bladeCount: 5,
          height: GRASS_CONFIG.heights.blade5,
          baseWidth: 0.1,
          tipWidth: 0.015,
          curveStrength: 0.17,
          rootRadius: 0.04,
          rootColor: new THREE.Color(0x3e732e),
          tipColor: new THREE.Color(0x7ec842),
          gradientPower: 0.9,
        };
      case 'dryGrass':
      default:
        return {
          bladeCount: 4,
          height: GRASS_CONFIG.heights.dryGrass,
          baseWidth: 0.05,
          tipWidth: 0.01,
          curveStrength: 0.16,
          rootRadius: 0.03,
          rootColor: new THREE.Color(0x9e8a52),
          tipColor: new THREE.Color(0xded09b),
          gradientPower: 1.1,
        };
    }
  }

  /**
   * Упрощенный пучок: те же лезвия, тот же наклон верхушки, но один сегмент
   * вместо трех (18 -> 6 треугольников для blade3). Силуэт пучка и покрытие
   * земли не меняются, поэтому разница видна только вплотную.
   */
  private static createLowBladeGeometry(variant: FoliageVariant): THREE.BufferGeometry {
    const p = GrassGeometryBuilder.bladeParamsFor(variant);
    return GrassGeometryBuilder.generateBladeGeometry(
      p.bladeCount,
      1,
      p.height,
      p.baseWidth,
      p.tipWidth,
      p.curveStrength,
      p.rootRadius,
      p.rootColor,
      p.tipColor,
      p.gradientPower
    );
  }

  /** Высохшая / соломенная трава */
  public static createDryGrassGeometry(): THREE.BufferGeometry {
    const p = GrassGeometryBuilder.bladeParamsFor('dryGrass');
    return GrassGeometryBuilder.generateBladeGeometry(
      p.bladeCount,
      3,
      p.height,
      p.baseWidth,
      p.tipWidth,
      p.curveStrength,
      p.rootRadius,
      p.rootColor,
      p.tipColor,
      p.gradientPower
    );
  }

  /** Пшеничный кустик из 3 золотистых колосков с полусферическими нормалями листвы */
  public static createWheatGeometry(): THREE.BufferGeometry {
    const stalkCount = 3;
    const baseHeight = GRASS_CONFIG.heights.wheat;
    const earHeight = 0.28;
    const earWidth = 0.052;

    const stalkColorRoot = new THREE.Color(0xd4be58);
    const stalkColorTip = new THREE.Color(0xf6d868);
    const earColor = new THREE.Color(0xffe676);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let vIdx = 0;

    for (let b = 0; b < stalkCount; b++) {
      const angle = (b / stalkCount) * Math.PI * 2 + b * 0.4;
      const rootDist = b === 0 ? 0.0 : 0.04;
      const rootX = Math.cos(angle) * rootDist;
      const rootZ = Math.sin(angle) * rootDist;

      const leanX = Math.cos(angle) * (b === 0 ? 0.02 : 0.08);
      const leanZ = Math.sin(angle) * (b === 0 ? 0.02 : 0.08);
      const height = baseHeight * (0.9 + (b === 0 ? 0.15 : b * 0.05));

      // 1. Стебель (двусторонний квад с нормалями, ориентированными к солнцу)
      const stalkSegs = 3;
      const stalkBaseIdx = vIdx;
      const stalkHalfW = 0.015;
      const perpX = -Math.sin(angle) * stalkHalfW;
      const perpZ = Math.cos(angle) * stalkHalfW;

      for (let s = 0; s <= stalkSegs; s++) {
        const t = s / stalkSegs;
        const y = t * (height - earHeight);
        const curX = rootX + leanX * t * t;
        const curZ = rootZ + leanZ * t * t;

        positions.push(curX - perpX, y, curZ - perpZ);
        positions.push(curX + perpX, y, curZ + perpZ);

        // Полусферическая нормаль: смотрит преимущественно вверх (0.85) и наружу (0.35)
        const nx = Math.cos(angle) * 0.35;
        const nz = Math.sin(angle) * 0.35;
        normals.push(nx, 0.85, nz, nx, 0.85, nz);

        uvs.push(0, t * 0.65, 1, t * 0.65);

        const col = new THREE.Color().lerpColors(stalkColorRoot, stalkColorTip, t);
        colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
        vIdx += 2;
      }

      for (let s = 0; s < stalkSegs; s++) {
        const bl = stalkBaseIdx + s * 2;
        indices.push(bl, bl + 1, bl + 2);
        indices.push(bl + 1, bl + 3, bl + 2);
      }

      // 2. Золотистый граненый колосок (правильный CCW обход граней)
      const earBaseY = height - earHeight;
      const earSides = 5;
      const earRings = 3;
      const earStartIdx = vIdx;

      for (let r = 0; r <= earRings; r++) {
        const rt = r / earRings;
        const ry = earBaseY + rt * earHeight;
        const rw = (Math.sin(rt * Math.PI) * 0.7 + 0.3) * earWidth;
        const curX = rootX + leanX * (0.7 + rt * 0.3);
        const curZ = rootZ + leanZ * (0.7 + rt * 0.3);

        for (let s = 0; s < earSides; s++) {
          const sa = (s / earSides) * Math.PI * 2;
          const px = curX + Math.cos(sa) * rw;
          const pz = curZ + Math.sin(sa) * rw;

          positions.push(px, ry, pz);

          // Нормали смотрят наружу от центра колоска и вверх в небо
          const nx = Math.cos(sa) * 0.45;
          const nz = Math.sin(sa) * 0.45;
          normals.push(nx, 0.8, nz);

          // Профиль изгиба по всей колосовине одинаков и равен профилю верха
          // стебля (0.65). Раньше он рос до 1.0, и при приминании колосок
          // крутился сильнее стебля: отрывался от него и сминался.
          uvs.push(s / earSides, 0.65);
          colors.push(earColor.r, earColor.g, earColor.b);
          vIdx++;
        }
      }

      // Корректный CCW обход граней цилиндра колоска (нормали смотрят строго наружу)
      for (let r = 0; r < earRings; r++) {
        const r0 = earStartIdx + r * earSides;
        const r1 = earStartIdx + (r + 1) * earSides;
        for (let s = 0; s < earSides; s++) {
          const next = (s + 1) % earSides;
          indices.push(r0 + s, r0 + next, r1 + s);
          indices.push(r0 + next, r1 + next, r1 + s);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.isSharedAsset = true;
    return geo;
  }

  /**
   * Пшеница дальнего LOD: стебель одним квадом + колосок граненой пирамидой
   * (18 треугольников вместо 108). Золотой колосок и общий силуэт кустика
   * сохраняются, поэтому пшеничное поле не превращается в зеленую кашу.
   */
  private static createLowWheatGeometry(): THREE.BufferGeometry {
    const stalkCount = 3;
    const baseHeight = GRASS_CONFIG.heights.wheat;
    const earHeight = 0.28;
    const earWidth = 0.052;

    const stalkColorRoot = new THREE.Color(0xd4be58);
    const stalkColorTip = new THREE.Color(0xf6d868);
    const earColor = new THREE.Color(0xffe676);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let b = 0; b < stalkCount; b++) {
      const angle = (b / stalkCount) * Math.PI * 2 + b * 0.4;
      const rootDist = b === 0 ? 0.0 : 0.04;
      const rootX = Math.cos(angle) * rootDist;
      const rootZ = Math.sin(angle) * rootDist;

      const leanX = Math.cos(angle) * (b === 0 ? 0.02 : 0.08);
      const leanZ = Math.sin(angle) * (b === 0 ? 0.02 : 0.08);
      const height = baseHeight * (0.9 + (b === 0 ? 0.15 : b * 0.05));
      const stalkTopY = height - earHeight;

      // 1. Стебель одним двусторонним квадом (полусферическая нормаль к небу)
      const stalkHalfW = 0.015;
      const perpX = -Math.sin(angle) * stalkHalfW;
      const perpZ = Math.cos(angle) * stalkHalfW;
      const nx = Math.cos(angle) * 0.35;
      const nz = Math.sin(angle) * 0.35;

      positions.push(
        rootX - perpX,
        0,
        rootZ - perpZ,
        rootX + perpX,
        0,
        rootZ + perpZ,
        rootX + leanX - perpX,
        stalkTopY,
        rootZ + leanZ - perpZ,
        rootX + leanX + perpX,
        stalkTopY,
        rootZ + leanZ + perpZ
      );
      for (let i = 0; i < 4; i++) normals.push(nx, 0.85, nz);
      uvs.push(0, 0, 1, 0, 0, 0.65, 1, 0.65);
      colors.push(
        stalkColorRoot.r,
        stalkColorRoot.g,
        stalkColorRoot.b,
        stalkColorRoot.r,
        stalkColorRoot.g,
        stalkColorRoot.b,
        stalkColorTip.r,
        stalkColorTip.g,
        stalkColorTip.b,
        stalkColorTip.r,
        stalkColorTip.g,
        stalkColorTip.b
      );
      const stalkIdx = positions.length / 3 - 4;
      indices.push(stalkIdx, stalkIdx + 1, stalkIdx + 2);
      indices.push(stalkIdx + 1, stalkIdx + 3, stalkIdx + 2);

      // 2. Колосок — 4-гранная пирамида: 4 треугольника вместо 30 на граненый цилиндр
      const earBaseY = stalkTopY;
      const earR = earWidth * 0.7;
      const earStartIdx = positions.length / 3;

      for (let s = 0; s < 4; s++) {
        const sa = (s / 4) * Math.PI * 2 + angle;
        positions.push(
          rootX + leanX + Math.cos(sa) * earR,
          earBaseY,
          rootZ + leanZ + Math.sin(sa) * earR
        );
        normals.push(Math.cos(sa) * 0.45, 0.8, Math.sin(sa) * 0.45);
        uvs.push(0, 0.65);
        colors.push(earColor.r, earColor.g, earColor.b);
      }
      // Вершина пирамиды (самая верхняя точка колоска)
      positions.push(rootX + leanX * 1.05, earBaseY + earHeight, rootZ + leanZ * 1.05);
      normals.push(0, 1, 0);
      // Вершина пирамиды едет вместе с основанием — профиль изгиба тот же
      uvs.push(0.5, 0.65);
      colors.push(earColor.r, earColor.g, earColor.b);
      const apexIdx = positions.length / 3 - 1;

      for (let s = 0; s < 4; s++) {
        const next = (s + 1) % 4;
        indices.push(earStartIdx + s, earStartIdx + next, apexIdx);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.isSharedAsset = true;
    return geo;
  }

  /** Камыш / Рогоз: яркие сочные листья и бархатный каштановый початок */
  public static createReedsGeometry(): THREE.BufferGeometry {
    const height = GRASS_CONFIG.heights.reeds;
    const headBaseY = height * 0.75;
    const headHeight = 0.32;
    const headRadius = 0.05;

    const stalkColor = new THREE.Color(0x689f38); // свежий сочный зеленый
    const leafColor = new THREE.Color(0x7cb342);
    const headColor = new THREE.Color(0x7d421e); // теплый бархатно-каштановый
    const tipSpikeColor = new THREE.Color(0xd4b85c);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    let vIdx = 0;

    // 1. Высокий центральный стебель
    const stalkSegs = 4;
    const stalkHalfW = 0.02;
    const stalkBaseIdx = vIdx;

    for (let s = 0; s <= stalkSegs; s++) {
      const t = s / stalkSegs;
      const y = t * height;
      positions.push(-stalkHalfW, y, 0);
      positions.push(stalkHalfW, y, 0);

      normals.push(0, 0.85, 0.35, 0, 0.85, 0.35);
      uvs.push(0, t, 1, t);

      const col = t > 0.88 ? tipSpikeColor : stalkColor;
      colors.push(col.r, col.g, col.b, col.r, col.g, col.b);
      vIdx += 2;
    }

    for (let s = 0; s < stalkSegs; s++) {
      const bl = stalkBaseIdx + s * 2;
      indices.push(bl, bl + 1, bl + 2);
      indices.push(bl + 1, bl + 3, bl + 2);
    }

    // 2. Длинные изящные ланцетные листья вокруг стебля
    const leafCount = 3;
    for (let l = 0; l < leafCount; l++) {
      const lang = (l / leafCount) * Math.PI * 2 + 0.3;
      const leafBaseIdx = vIdx;
      const leafH = 0.9 + l * 0.15;
      const dirX = Math.cos(lang);
      const dirZ = Math.sin(lang);
      const perpX = -dirZ * 0.035;
      const perpZ = dirX * 0.035;

      for (let s = 0; s <= 3; s++) {
        const t = s / 3;
        const y = t * leafH;
        const arch = t * t * 0.14;
        const hw = (1 - t * 0.7) * 1.0;

        const cx = dirX * arch;
        const cz = dirZ * arch;

        positions.push(cx - perpX * hw, y, cz - perpZ * hw);
        positions.push(cx + perpX * hw, y, cz + perpZ * hw);

        normals.push(dirX * 0.4, 0.85, dirZ * 0.4, dirX * 0.4, 0.85, dirZ * 0.4);
        uvs.push(0, t, 1, t);
        colors.push(leafColor.r, leafColor.g, leafColor.b, leafColor.r, leafColor.g, leafColor.b);
        vIdx += 2;
      }

      for (let s = 0; s < 3; s++) {
        const bl = leafBaseIdx + s * 2;
        indices.push(bl, bl + 1, bl + 2);
        indices.push(bl + 1, bl + 3, bl + 2);
      }
    }

    // 3. Теплый коричневый початок камыша (правильный CCW обход граней)
    const sides = 6;
    const headRings = 3;
    const headStartIdx = vIdx;

    for (let r = 0; r <= headRings; r++) {
      const rt = r / headRings;
      const y = headBaseY + rt * headHeight;
      const rad = (Math.sin(rt * Math.PI) * 0.35 + 0.65) * headRadius;

      for (let s = 0; s < sides; s++) {
        const sa = (s / sides) * Math.PI * 2;
        positions.push(Math.cos(sa) * rad, y, Math.sin(sa) * rad);

        // Нормали смотрят наружу от центра початка и вверх к небу
        const nx = Math.cos(sa) * 0.55;
        const nz = Math.sin(sa) * 0.55;
        normals.push(nx, 0.75, nz);

        // Профиль изгиба початка равен профилю стебля в точке его крепления
        // (headBaseY = 0.75 высоты). Раньше он рос до 0.95, из-за чего початок
        // при приминании отрывался от стебля и сплющивался.
        uvs.push(s / sides, 0.75);
        colors.push(headColor.r, headColor.g, headColor.b);
        vIdx++;
      }
    }

    for (let r = 0; r < headRings; r++) {
      const r0 = headStartIdx + r * sides;
      const r1 = headStartIdx + (r + 1) * sides;
      for (let s = 0; s < sides; s++) {
        const next = (s + 1) % sides;
        // Строго CCW: нормаль направлена наружу, а не внутрь
        indices.push(r0 + s, r1 + s, r0 + next);
        indices.push(r0 + next, r1 + s, r1 + next);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.isSharedAsset = true;
    return geo;
  }

  /**
   * Камыш дальнего LOD: стебель одним квадом, два листа и початок-пирамида
   * (10 треугольников вместо 62). Сохраняются и высота (1.45 м), и каштановый
   * початок, и золотистое рыльце на макушке — силуэт узнаваем с любой дистанции.
   */
  private static createLowReedsGeometry(): THREE.BufferGeometry {
    const height = GRASS_CONFIG.heights.reeds;
    const headBaseY = height * 0.75;
    const headHeight = 0.32;
    const headRadius = 0.05;

    const stalkColor = new THREE.Color(0x689f38);
    const leafColor = new THREE.Color(0x7cb342);
    const headColor = new THREE.Color(0x7d421e);
    const tipSpikeColor = new THREE.Color(0xd4b85c);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // 1. Высокий стебель одним двусторонним квадом (макушка — золотистое рыльце)
    const stalkHalfW = 0.02;
    positions.push(
      -stalkHalfW,
      0,
      0,
      stalkHalfW,
      0,
      0,
      -stalkHalfW,
      height,
      0,
      stalkHalfW,
      height,
      0
    );
    for (let i = 0; i < 4; i++) normals.push(0, 0.85, 0.35);
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    colors.push(
      stalkColor.r,
      stalkColor.g,
      stalkColor.b,
      stalkColor.r,
      stalkColor.g,
      stalkColor.b,
      tipSpikeColor.r,
      tipSpikeColor.g,
      tipSpikeColor.b,
      tipSpikeColor.r,
      tipSpikeColor.g,
      tipSpikeColor.b
    );
    indices.push(0, 1, 2, 1, 3, 2);

    // 2. Три ланцетных листа (по кваду на лист вместо четырех сегментов)
    const leafCount = 3;
    for (let l = 0; l < leafCount; l++) {
      const lang = (l / leafCount) * Math.PI * 2 + 0.3;
      const leafH = 0.9 + l * 0.15;
      const dirX = Math.cos(lang);
      const dirZ = Math.sin(lang);
      const perpX = -dirZ * 0.035;
      const perpZ = dirX * 0.035;
      const baseIdx = positions.length / 3;

      positions.push(
        -perpX,
        0,
        -perpZ,
        perpX,
        0,
        perpZ,
        dirX * 0.14 - perpX * 0.3,
        leafH,
        dirZ * 0.14 - perpZ * 0.3,
        dirX * 0.14 + perpX * 0.3,
        leafH,
        dirZ * 0.14 + perpZ * 0.3
      );
      for (let i = 0; i < 4; i++) normals.push(dirX * 0.4, 0.85, dirZ * 0.4);
      uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
      for (let i = 0; i < 4; i++) colors.push(leafColor.r, leafColor.g, leafColor.b);
      indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
      indices.push(baseIdx + 1, baseIdx + 3, baseIdx + 2);
    }

    // 3. Теплый коричневый початок — 4-гранная пирамида (силуэтный «карандаш»)
    const headStartIdx = positions.length / 3;
    for (let s = 0; s < 4; s++) {
      const sa = (s / 4) * Math.PI * 2;
      positions.push(Math.cos(sa) * headRadius * 0.7, headBaseY, Math.sin(sa) * headRadius * 0.7);
      normals.push(Math.cos(sa) * 0.55, 0.75, Math.sin(sa) * 0.55);
      uvs.push(0, 0.75);
      colors.push(headColor.r, headColor.g, headColor.b);
    }
    positions.push(0, headBaseY + headHeight, 0);
    normals.push(0, 0.9, 0);
    uvs.push(0.5, 0.75);
    colors.push(headColor.r, headColor.g, headColor.b);
    const headApexIdx = positions.length / 3 - 1;
    for (let s = 0; s < 4; s++) {
      indices.push(headStartIdx + s, headStartIdx + ((s + 1) % 4), headApexIdx);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.isSharedAsset = true;
    return geo;
  }

  /** Палитра и число лепестков вида цветка: общие для полной и упрощенной геометрии */
  private static flowerStyle(type: FlowerType): {
    petalColor: THREE.Color;
    centerColor: THREE.Color;
    petalCount: number;
  } {
    switch (type) {
      case 'cornflower':
        // небесно-васильковый
        return {
          petalColor: new THREE.Color(0x29b6f6),
          centerColor: new THREE.Color(0x0d47a1),
          petalCount: 6,
        };
      case 'daisy':
        // белая ромашка
        return {
          petalColor: new THREE.Color(0xffffff),
          centerColor: new THREE.Color(0xffca28),
          petalCount: 8,
        };
      case 'dandelion':
        // солнечный одуванчик
        return {
          petalColor: new THREE.Color(0xffd54f),
          centerColor: new THREE.Color(0xffa000),
          petalCount: 7,
        };
      case 'poppy':
      default:
        // алый мак
        return {
          petalColor: new THREE.Color(0xff3333),
          centerColor: new THREE.Color(0x212121),
          petalCount: 5,
        };
    }
  }

  /**
   * Цветок дальнего LOD: стебель одним квадом + соцветие двумя горизонтальными
   * кватами (лепестки снизу, сердцевина сверху) — 6 треугольников вместо ~32.
   * На дальней дистанции соцветие занимает 2-4 пикселя, поэтому важен только
   * цвет: именно он дает читаемую «горошину» конопляника/ромашки в общей массе.
   */
  private static createLowFlowerGeometry(type: FlowerType): THREE.BufferGeometry {
    const stemHeight = GRASS_CONFIG.heights.flowers;
    const flowerRadius = 0.11;
    const stemColor = new THREE.Color(0x689f38);
    const { petalColor, centerColor } = GrassGeometryBuilder.flowerStyle(type);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // 1. Стебель одним двусторонним квадом
    const hw = 0.015;
    positions.push(-hw, 0, 0, hw, 0, 0, -hw, stemHeight, 0, hw, stemHeight, 0);
    for (let i = 0; i < 4; i++) normals.push(0, 0.88, 0.25);
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1);
    for (let i = 0; i < 4; i++) colors.push(stemColor.r, stemColor.g, stemColor.b);
    indices.push(0, 1, 2, 1, 3, 2);

    // 2. Соцветие: лепестки и сердцевина двумя кватами, смотрящими строго в небо
    const petalR = flowerRadius * 1.15;
    const centerR = flowerRadius * 0.5;
    const petalY = stemHeight + 0.018;
    const centerY = stemHeight + 0.032;

    positions.push(
      -petalR,
      petalY,
      -petalR,
      petalR,
      petalY,
      -petalR,
      petalR,
      petalY,
      petalR,
      -petalR,
      petalY,
      petalR
    );
    for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) colors.push(petalColor.r, petalColor.g, petalColor.b);
    indices.push(4, 5, 6, 4, 6, 7);

    positions.push(
      -centerR,
      centerY,
      -centerR,
      centerR,
      centerY,
      -centerR,
      centerR,
      centerY,
      centerR,
      -centerR,
      centerY,
      centerR
    );
    for (let i = 0; i < 4; i++) normals.push(0, 1, 0);
    uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) colors.push(centerColor.r, centerColor.g, centerColor.b);
    indices.push(8, 9, 10, 8, 10, 11);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.isSharedAsset = true;
    return geo;
  }

  /** Полевые цветы: яркие насыщенные лепестки с верным зенитным освещением */
  public static createFlowerGeometry(type: FlowerType): THREE.BufferGeometry {
    const stemHeight = GRASS_CONFIG.heights.flowers;
    const flowerRadius = 0.11;
    const stemColor = new THREE.Color(0x689f38); // свежий салатово-зеленый

    const { petalColor, centerColor, petalCount } = GrassGeometryBuilder.flowerStyle(type);

    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    // 1. Зеленый стебель с 2 листочками у основания
    const hw = 0.015;
    positions.push(-hw, 0, 0, hw, 0, 0, -hw, stemHeight, 0, hw, stemHeight, 0);
    positions.push(0, 0, -hw, 0, 0, hw, 0, stemHeight, -hw, 0, stemHeight, hw);

    for (let i = 0; i < 8; i++) {
      normals.push(0, 0.88, 0.25);
      uvs.push(0, FLOWER_BEND_WEIGHT);
      colors.push(stemColor.r, stemColor.g, stemColor.b);
    }
    // Правильный CCW обход квадов стебля
    indices.push(0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6);

    // 2. Центр цветка (выпуклая серединка)
    const centerIdx = 8;
    positions.push(0, stemHeight + 0.02, 0);
    normals.push(0, 0.98, 0.05);
    uvs.push(0.5, FLOWER_BEND_WEIGHT);
    colors.push(centerColor.r, centerColor.g, centerColor.b);

    // 3. Объемные закругленные лепестки (состоят из 2 треугольников с расширением к центру)
    let pIdx = centerIdx + 1;
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const bIdx = centerIdx;

      // Угловой полуразмах лепестка для создания округлой формы
      const sideSpread = (0.48 / petalCount) * Math.PI * 2;
      const midAngleL = angle - sideSpread;
      const midAngleR = angle + sideSpread;

      const midDist = flowerRadius * 0.62;
      const lIdx = pIdx++;
      const rIdx = pIdx++;
      const tipIdx = pIdx++;

      // Левая точка расширения лепестка
      positions.push(
        Math.cos(midAngleL) * midDist,
        stemHeight + 0.018,
        Math.sin(midAngleL) * midDist
      );
      normals.push(0, 0.9, 0.4);
      uvs.push(0.2, FLOWER_BEND_WEIGHT);
      colors.push(petalColor.r, petalColor.g, petalColor.b);

      // Правая точка расширения лепестка
      positions.push(
        Math.cos(midAngleR) * midDist,
        stemHeight + 0.018,
        Math.sin(midAngleR) * midDist
      );
      normals.push(0, 0.9, 0.4);
      uvs.push(0.8, 0.4);
      colors.push(petalColor.r, petalColor.g, petalColor.b);

      // Кончик лепестка (слегка приподнят для чашевидной формы)
      const tipDist = flowerRadius * 1.15;
      positions.push(Math.cos(angle) * tipDist, stemHeight + 0.035, Math.sin(angle) * tipDist);
      normals.push(Math.cos(angle) * 0.3, 0.85, Math.sin(angle) * 0.3);
      uvs.push(0.5, FLOWER_BEND_WEIGHT);
      colors.push(petalColor.r, petalColor.g, petalColor.b);

      // Два треугольника лепестка (CCW обход: Центр -> Лево -> Кончик, Центр -> Кончик -> Право)
      indices.push(bIdx, lIdx, tipIdx);
      indices.push(bIdx, tipIdx, rIdx);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    geo.userData.isSharedAsset = true;
    return geo;
  }

  private static generateBladeGeometry(
    bladeCount: number,
    segments: number,
    height: number,
    baseWidth: number,
    tipWidth: number,
    curveStrength: number,
    rootRadius: number,
    rootColor: THREE.Color,
    tipColor: THREE.Color,
    gradientPower: number
  ): THREE.BufferGeometry {
    const rowsPerBlade = segments + 1;
    const verticesPerBlade = rowsPerBlade * 2;
    const totalVertices = bladeCount * verticesPerBlade;
    const trianglesPerBlade = segments * 2;
    const totalIndices = bladeCount * trianglesPerBlade * 3;

    const positions = new Float32Array(totalVertices * 3);
    const normals = new Float32Array(totalVertices * 3);
    const uvs = new Float32Array(totalVertices * 2);
    const colors = new Float32Array(totalVertices * 3);
    const indices = new Uint16Array(totalIndices);

    let vOffset = 0;
    let iOffset = 0;

    for (let b = 0; b < bladeCount; b++) {
      const angleFraction = b / bladeCount;
      const angle = angleFraction * Math.PI * 2 + Math.sin(b * 12.9898) * 0.2;

      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);

      const perpX = -dirZ;
      const perpZ = dirX;

      const bladeHeight = height * (0.85 + (Math.sin(b * 4.33) * 0.5 + 0.5) * 0.3);
      const bladeCurve = curveStrength * (0.85 + (Math.cos(b * 7.12) * 0.5 + 0.5) * 0.3);

      const bladeVertexStartIndex = vOffset / 3;

      for (let s = 0; s <= segments; s++) {
        const t = s / segments;

        const y = t * bladeHeight;
        const lean = bladeCurve * t * t;
        const currentHalfWidth = s === segments ? 0.0 : (baseWidth * (1 - t) + tipWidth * t) * 0.5;

        const centerX = dirX * (rootRadius + lean);
        const centerZ = dirZ * (rootRadius + lean);

        const leftIdx = vOffset;
        positions[leftIdx] = centerX - perpX * currentHalfWidth;
        positions[leftIdx + 1] = y;
        positions[leftIdx + 2] = centerZ - perpZ * currentHalfWidth;

        const rightIdx = vOffset + 3;
        positions[rightIdx] = centerX + perpX * currentHalfWidth;
        positions[rightIdx + 1] = y;
        positions[rightIdx + 2] = centerZ + perpZ * currentHalfWidth;

        const normX = dirX * 0.35;
        const normY = 0.85;
        const normZ = dirZ * 0.35;
        const nLen = Math.hypot(normX, normY, normZ) || 1.0;

        normals[leftIdx] = normX / nLen;
        normals[leftIdx + 1] = normY / nLen;
        normals[leftIdx + 2] = normZ / nLen;

        normals[rightIdx] = normX / nLen;
        normals[rightIdx + 1] = normY / nLen;
        normals[rightIdx + 2] = normZ / nLen;

        const uvIdx = (vOffset / 3) * 2;
        uvs[uvIdx] = 0.0;
        uvs[uvIdx + 1] = t;

        uvs[uvIdx + 2] = 1.0;
        uvs[uvIdx + 3] = t;

        const colorFactor = Math.pow(t, gradientPower);
        const r = THREE.MathUtils.lerp(rootColor.r, tipColor.r, colorFactor);
        const g = THREE.MathUtils.lerp(rootColor.g, tipColor.g, colorFactor);
        const bCol = THREE.MathUtils.lerp(rootColor.b, tipColor.b, colorFactor);

        colors[leftIdx] = r;
        colors[leftIdx + 1] = g;
        colors[leftIdx + 2] = bCol;

        colors[rightIdx] = r;
        colors[rightIdx + 1] = g;
        colors[rightIdx + 2] = bCol;

        vOffset += 6;
      }

      for (let s = 0; s < segments; s++) {
        const bl = bladeVertexStartIndex + s * 2;
        const br = bl + 1;
        const tl = bl + 2;
        const tr = bl + 3;

        indices[iOffset++] = bl;
        indices[iOffset++] = br;
        indices[iOffset++] = tl;

        indices[iOffset++] = br;
        indices[iOffset++] = tr;
        indices[iOffset++] = tl;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.userData.isSharedAsset = true;
    return geometry;
  }
}
