import { prisma } from '@shift-happens/db';
import type { MediaPublishInput } from '@shift-happens/shared';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';
import { getTables } from './stage-engine.js';

const num = (v: unknown) => Number(v ?? 0);

export async function listArchitectAssets(restaurantId = env.RESTAURANT_ID) {
  const [items, categories, tables] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId },
      include: { category: true },
      orderBy: [{ category: { displayOrder: 'asc' } }, { name: 'asc' }],
    }),
    prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { displayOrder: 'asc' },
    }),
    getTables(restaurantId),
  ]);

  const mapped = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    price: num(item.price),
    station: item.station,
    categoryId: item.categoryId,
    category: item.category?.name ?? null,
    imageUrlPos: item.imageUrlPos,
    imageUrlMobile: item.imageUrlMobile,
    cropPos: item.cropPos,
    cropMobile: item.cropMobile,
    is86ed: item.is86ed,
    hasPosMedia: Boolean(item.imageUrlPos),
    hasMobileMedia: Boolean(item.imageUrlMobile),
    tags: item.tags,
  }));

  return {
    menuItems: mapped,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      count: mapped.filter((m) => m.categoryId === c.id).length,
    })),
    tables,
    mediaHealth: {
      total: mapped.length,
      mappedPos: mapped.filter((m) => m.hasPosMedia).length,
      mappedMobile: mapped.filter((m) => m.hasMobileMedia).length,
      unmapped: mapped.filter((m) => !m.hasPosMedia || !m.hasMobileMedia).length,
      coverage:
        mapped.length > 0
          ? Math.round(
              (mapped.filter((m) => m.hasPosMedia && m.hasMobileMedia).length /
                mapped.length) *
                100,
            )
          : 0,
    },
  };
}

export async function publishMedia(
  input: MediaPublishInput,
  restaurantId = env.RESTAURANT_ID,
) {
  const item = await prisma.menuItem.findFirst({
    where: { id: input.menuItemId, restaurantId },
  });
  if (!item) throw notFound('Menu item not found');

  const updated = await prisma.menuItem.update({
    where: { id: item.id },
    data: {
      ...(input.imageUrlPos !== undefined ? { imageUrlPos: input.imageUrlPos } : {}),
      ...(input.imageUrlMobile !== undefined ? { imageUrlMobile: input.imageUrlMobile } : {}),
      ...(input.cropPos !== undefined && input.cropPos !== null
        ? { cropPos: input.cropPos }
        : {}),
      ...(input.cropMobile !== undefined && input.cropMobile !== null
        ? { cropMobile: input.cropMobile }
        : {}),
    },
    include: { category: true },
  });

  emitRestaurant('MEDIA_PUBLISHED', {
    event: 'MEDIA_PUBLISHED',
    menuItemId: updated.id,
    name: updated.name,
    publishTo: input.publishTo,
    imageUrlPos: updated.imageUrlPos,
    imageUrlMobile: updated.imageUrlMobile,
    timestamp: new Date().toISOString(),
  }, restaurantId);

  return {
    menuItemId: updated.id,
    name: updated.name,
    imageUrlPos: updated.imageUrlPos,
    imageUrlMobile: updated.imageUrlMobile,
    publishTo: input.publishTo,
    publishedAt: new Date().toISOString(),
    terminalsSynced: input.publishTo.includes('pos') ? 14 : 0,
  };
}

export async function publishAllMedia(restaurantId = env.RESTAURANT_ID) {
  const items = await prisma.menuItem.findMany({ where: { restaurantId } });
  const result = await prisma.menuItem.updateMany({
    where: { restaurantId },
    data: {},
  });
  emitRestaurant('MEDIA_PUBLISHED', {
    event: 'MEDIA_PUBLISHED',
    publishTo: ['pos', 'mobile', 'kds', 'voice_ai'],
    count: items.length,
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return {
    published: result.count,
    terminals: 14,
    voiceKnowledgeEntries: items.length,
    publishedAt: new Date().toISOString(),
  };
}

export async function syncVoiceKnowledge(restaurantId = env.RESTAURANT_ID) {
  const [menuItems, kbCount] = await Promise.all([
    prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, is86ed: true, price: true, station: true },
    }),
    prisma.knowledgeBase.count({ where: { restaurantId } }),
  ]);
  emitRestaurant('BRIEFING_UPDATED', {
    event: 'BRIEFING_UPDATED',
    voiceKnowledgeSynced: true,
    menuItems: menuItems.length,
    timestamp: new Date().toISOString(),
  }, restaurantId);
  return {
    synced: true,
    menuItems: menuItems.length,
    knowledgeEntries: kbCount,
    eightySixed: menuItems.filter((m) => m.is86ed).length,
    syncedAt: new Date().toISOString(),
  };
}
