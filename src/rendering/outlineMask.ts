import * as THREE from 'three';

/**
 * Контракт пост-процесса обводок (см. `postprocessing/OutlinePass`).
 *
 * Маски обводок строятся принудительным рендером сцены с плоскими материалами-заменителями,
 * поэтому «кто попадёт в маску» задаётся слоями объектов: камера на время прохода
 * переключается на нужный слой через `camera.layers.set(...)`.
 *
 * Поверх слоёв используется идентификатор объекта (см. `attachOutlineObjectId`): он
 * кодируется в альфа-канал маски и позволяет отличать «свой силуэт» от «чужого».
 * Без него два перекрывающихся cel-кандидата сливались бы в одно пятно, и внутренняя
 * граница между ними (контур переднего объекта поверх заднего) не была бы видна.
 */

/**
 * Слой cel-обводки (черный контур): существа, предметы, части тел, снаряды и ВСЕ препятствия.
 * Объекты остаются и на слое 0, чтобы продолжать участвовать в основном рендере.
 */
export const CEL_OUTLINE_LAYER = 1;

/**
 * Слой текущего выделения (редактор/игра). Дает зеленый канал маски,
 * который имеет приоритет цвета над cel-обводкой.
 */
export const SELECT_OUTLINE_LAYER = 2;

/**
 * Слой перекрывающей геометрии без собственного контура (рельеф и юбка горизонта).
 * Рендерится первым и пишет только глубину: благодаря этому контуры объектов
 * не просвечивают сквозь горы и холмы, а границы перекрывающихся силуэтов
 * определяются корректно (передний объект «съедает» контур заднего).
 */
export const OUTLINE_OCCLUDER_LAYER = 3;

/**
 * Диапазон идентификаторов объектов: значение в маске хранится как id / OUTLINE_ID_SCALE.
 * 1024 значения укладываются в точность half-float, а округление при чтении
 * восстанавливает исходный id без погрешности. Ноль зарезервирован под «объекта нет»
 * (фон и перекрывающая геометрия).
 */
export const OUTLINE_ID_SCALE = 1024;

/**
 * Общий uniform идентификатора объекта для проходов маски.
 *
 * Значение выставляется в `Object3D.onBeforeRender` (three вызывает его и при
 * `scene.overrideMaterial`), а принудительная перезаливка uniform — через
 * `material.uniformsNeedUpdate`, иначе three перезаливает uniform только при смене
 * материала и все объекты получили бы id первого отрисованного.
 */
export const outlineObjectIdUniform = { value: 0 };

/** Стабильный хеш строки в диапазон [1, OUTLINE_ID_SCALE - 1] */
function outlineIdFor(entityId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < entityId.length; i++) {
    hash ^= entityId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % (OUTLINE_ID_SCALE - 1)) + 1;
}

/**
 * Меши-оклюдеры, которые на время прохода оклюдеров подменяют свой материал
 * на дешёвый depth-вариант: их собственный шейдер важен (у травы он схлопывает
 * дальние пучки в ноль), но считать полное освещение ради маски не нужно.
 */
interface OccluderMaterialSwap {
  main: THREE.Material;
  depth: THREE.Material;
}
const occluderSwaps = new Map<THREE.Mesh, OccluderMaterialSwap>();

/** Регистрация меша-окклюдера (вызывается при создании мешей травы) */
export function registerOutlineOccluderMesh(
  mesh: THREE.Mesh,
  main: THREE.Material,
  depth: THREE.Material
): void {
  occluderSwaps.set(mesh, { main, depth });
}

/** Снятие регистрации при уничтожении меша (чанк травы выгружен) */
export function unregisterOutlineOccluderMesh(mesh: THREE.Mesh): void {
  occluderSwaps.delete(mesh);
}

/** Переключение «дешёвый depth-материал / обычный материал» на время прохода оклюдеров */
export function setOutlineOccluderMeshes(depthMode: boolean): void {
  for (const [mesh, materials] of occluderSwaps) {
    mesh.material = depthMode ? materials.depth : materials.main;
  }
}

/**
 * Привязывает объект к идентификатору сущности для масок обводок.
 * Все меши одной сущности получают один и тот же id — благодаря этому контур
 * рисуется на границе разных объектов, но не внутри одного (между частями рига,
 * стволом и кроной дерева и т.п.).
 *
 * Вызывается один раз при создании мешей сущности.
 */
export function attachOutlineObjectId(obj: THREE.Object3D, entityId: string): void {
  const normalized = outlineIdFor(entityId) / OUTLINE_ID_SCALE;

  obj.traverse((child) => {
    child.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
      outlineObjectIdUniform.value = normalized;
      // three перезаливает uniform только при смене материала, поэтому для
      // ShaderMaterial маски явно просим перезаливку перед отрисовкой объекта
      const maskMaterial = material as THREE.ShaderMaterial;
      if (maskMaterial.isShaderMaterial) {
        maskMaterial.uniformsNeedUpdate = true;
      }
    };
  });
}
