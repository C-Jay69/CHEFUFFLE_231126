import type { FastifyPluginAsync } from 'fastify';
import { createWriteStream } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { prisma } from '@shift-happens/db';
import { env } from '../env.js';
import { badRequest } from '../errors.js';
import { requirePermission } from '../lib/staff-auth.js';
import {
  getFloorPlanConfig,
  setFloorPlanBackground,
} from '../services/stage-engine.js';

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

const floorPlanRoutes: FastifyPluginAsync = async (app) => {
  app.get('/floor-plan/config', async () => getFloorPlanConfig());

  app.post('/floor-plan/background', async (request) => {
    await requirePermission(request, 'floor.manage');
    const data = await request.file();
    if (!data) throw badRequest('No file uploaded');
    const extension = MIME_EXT[data.mimetype];
    if (!extension) {
      throw badRequest('Upload a PNG, JPG, WebP, or PDF floor plan');
    }

    const directory = resolve(process.cwd(), 'uploads', 'floorplans');
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await pipeline(data.file, createWriteStream(resolve(directory, filename)));

    // Remove the previous local upload.
    const current = await prisma.restaurant.findUnique({
      where: { id: env.RESTAURANT_ID },
      select: { floorPlanImageUrl: true },
    });
    const previous = current?.floorPlanImageUrl;
    if (previous?.startsWith('/uploads/floorplans/')) {
      await unlink(resolve(directory, basename(previous))).catch(() => undefined);
    }

    const url = `/uploads/floorplans/${filename}`;
    const config = await setFloorPlanBackground(url, data.mimetype);
    return { ...config, filename: data.filename };
  });

  app.delete('/floor-plan/background', async (request) => {
    await requirePermission(request, 'floor.manage');
    const current = await prisma.restaurant.findUnique({
      where: { id: env.RESTAURANT_ID },
      select: { floorPlanImageUrl: true },
    });
    const previous = current?.floorPlanImageUrl;
    if (previous?.startsWith('/uploads/floorplans/')) {
      await unlink(resolve(process.cwd(), 'uploads', 'floorplans', basename(previous))).catch(
        () => undefined,
      );
    }
    return setFloorPlanBackground(null, null);
  });
};

export default floorPlanRoutes;
