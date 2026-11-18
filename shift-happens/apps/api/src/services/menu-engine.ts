import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';

const num = (v: unknown) => Number(v ?? 0);

export interface MenuItemDto {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string | null;
  category: string | null;
  station: string;
  targetPrepTimeSeconds: number;
  imageUrlPos: string | null;
  imageUrlMobile: string | null;
  tags: string[];
  is86ed: boolean;
  eightySixReason: string | null;
  portionsLeft: number;
  stockStatus: 'in_stock' | 'low' | 'out';
  linkedIngredients: Array<{
    id: string;
    name: string;
    quantityRequired: number;
    currentStock: number;
    unit: string;
  }>;
}

export function toMenuItemDto(item: any): MenuItemDto {
  const recipeIngredients = item.recipe?.recipeIngredients ?? [];
  let portionsLeft = Number.POSITIVE_INFINITY;
  for (const ri of recipeIngredients) {
    const qty = num(ri.quantityRequired);
    if (qty > 0) portionsLeft = Math.min(portionsLeft, Math.floor(num(ri.ingredient.currentStock) / qty));
  }
  if (!Number.isFinite(portionsLeft)) portionsLeft = -1;
  const stockStatus: MenuItemDto['stockStatus'] =
    item.is86ed || portionsLeft === 0
      ? 'out'
      : portionsLeft >= 0 && portionsLeft <= 8
        ? 'low'
        : 'in_stock';
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: num(item.price),
    categoryId: item.categoryId,
    category: item.category?.name ?? null,
    station: item.station,
    targetPrepTimeSeconds: item.targetPrepTimeSeconds,
    imageUrlPos: item.imageUrlPos,
    imageUrlMobile: item.imageUrlMobile,
    tags: item.tags ?? [],
    is86ed: item.is86ed,
    eightySixReason: item.eightySixReason,
    portionsLeft,
    stockStatus,
    linkedIngredients: recipeIngredients.map((ri: any) => ({
      id: ri.ingredient.id,
      name: ri.ingredient.name,
      quantityRequired: num(ri.quantityRequired),
      currentStock: num(ri.ingredient.currentStock),
      unit: ri.ingredient.unit,
    })),
  };
}

const menuInclude = {
  category: true,
  recipe: {
    include: {
      recipeIngredients: { include: { ingredient: true } },
    },
  },
};

export async function listMenu(restaurantId = env.RESTAURANT_ID) {
  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId },
      include: menuInclude,
      orderBy: [{ category: { displayOrder: 'asc' } }, { name: 'asc' }],
    }),
    prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
    }),
  ]);
  const mapped = items.map(toMenuItemDto);
  return {
    items: mapped,
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      displayOrder: category.displayOrder,
      itemCount: mapped.filter((item) => item.categoryId === category.id).length,
    })),
    availableCount: mapped.filter((item) => !item.is86ed).length,
    eightySixCount: mapped.filter((item) => item.is86ed).length,
  };
}

export async function toggleMenuAvailability(
  id: string,
  is86ed: boolean,
  reason: string | undefined,
  restaurantId = env.RESTAURANT_ID,
) {
  const item = await prisma.menuItem.findFirst({
    where: { id, restaurantId },
    include: menuInclude,
  });
  if (!item) throw notFound('Menu item not found');
  const updated = await prisma.menuItem.update({
    where: { id },
    data: {
      is86ed,
      eightySixReason: is86ed ? reason ?? 'Manually 86ed by manager' : null,
    },
    include: menuInclude,
  });
  emitRestaurant('GLOBAL_86_ITEM_UPDATE', {
    event: 'GLOBAL_86_ITEM_UPDATE',
    menuItemId: updated.id,
    name: updated.name,
    is86ed: updated.is86ed,
    reason: updated.eightySixReason ?? undefined,
    source: 'manual',
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return toMenuItemDto(updated);
}
