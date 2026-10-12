/** The furniture catalog: every buildable piece, keyed by id. */
import { CHAPEL } from './chapel';
import { GALLERY } from './gallery';
import { GARDEN } from './garden';
import { KITCHEN } from './kitchen';
import { PARLOUR } from './parlour';
import type { FurnitureDef } from './types';
import { WORKSHOP } from './workshop';

export const CATALOG: FurnitureDef[] = [...GARDEN, ...PARLOUR, ...KITCHEN, ...WORKSHOP, ...GALLERY, ...CHAPEL];

export const FURNITURE = new Map(CATALOG.map((d) => [d.id, d]));

/** Options for a space, in creation-menu order (by level). */
export const optionsFor = (space: FurnitureDef['space']) =>
  CATALOG.filter((d) => d.space === space).sort((a, b) => a.level - b.level);
