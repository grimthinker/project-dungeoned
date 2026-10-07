/**
 * Перечень видов процедурной растительности.
 *
 * Вынесен в отдельный модуль, чтобы геометрия, чанки и система синхронизации
 * зависели от одного источника правды (раньше тип жил в GrassSyncSystem, а
 * GrassChunk импортировал его оттуда — получался циклический импорт).
 */

export type FoliageVariant =
  | 'grass3'
  | 'grass4'
  | 'grass5'
  | 'wheat'
  | 'reeds'
  | 'dryGrass'
  | 'flowerRed'
  | 'flowerBlue'
  | 'flowerWhite'
  | 'flowerYellow';

export const GRASS_VARIANTS: FoliageVariant[] = [
  'grass3',
  'grass4',
  'grass5',
  'wheat',
  'reeds',
  'dryGrass',
  'flowerRed',
  'flowerBlue',
  'flowerWhite',
  'flowerYellow',
];

/** Сопоставление вида растительности с типом соцветия для построения геометрии */
export const FLOWER_BY_VARIANT: Record<
  FoliageVariant,
  'poppy' | 'cornflower' | 'daisy' | 'dandelion'
> = {
  flowerRed: 'poppy',
  flowerBlue: 'cornflower',
  flowerWhite: 'daisy',
  flowerYellow: 'dandelion',
  grass3: 'poppy',
  grass4: 'poppy',
  grass5: 'poppy',
  wheat: 'poppy',
  reeds: 'poppy',
  dryGrass: 'poppy',
};
