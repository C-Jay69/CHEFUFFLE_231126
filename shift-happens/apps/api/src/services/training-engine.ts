import { prisma } from '@shift-happens/db';
import type { TrainingEnrollInput } from '@shift-happens/shared';
import { env } from '../env.js';
import { notFound } from '../errors.js';
import { emitRestaurant } from '../realtime.js';
import { sendMessage } from './notifier.js';

const TRACK_LABELS: Record<string, string> = {
  'Service & POS Mastery': 'Service & POS Mastery',
  'Kitchen Ops & KDS Speed': 'Kitchen Ops & KDS Speed',
  'Allergen & Cross-Contam': 'Allergen & Cross-Contamination Guard',
  'Voice AI Concierge Sync': 'Voice AI Concierge Sync',
};

export async function listTraining(restaurantId = env.RESTAURANT_ID) {
  const [modules, trainees] = await Promise.all([
    prisma.trainingModule.findMany({
      where: { restaurantId },
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    }),
    prisma.trainee.findMany({
      where: { restaurantId },
      include: {
        assignments: { include: { module: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const tracks = new Map<string, { track: string; label: string; modules: number; minutes: number }>();
  for (const module of modules) {
    const current = tracks.get(module.track) ?? {
      track: module.track,
      label: TRACK_LABELS[module.track] ?? module.track,
      modules: 0,
      minutes: 0,
    };
    current.modules += 1;
    current.minutes += module.durationMinutes;
    tracks.set(module.track, current);
  }

  const serializedTrainees = trainees.map((t) => ({
    id: t.id,
    fullName: t.fullName,
    role: t.role,
    mentor: t.mentor,
    status: t.status,
    progress:
      t.assignments.length > 0
        ? Math.round(
            (t.assignments.filter((a) => a.status === 'completed').length /
              t.assignments.length) *
              100,
          )
        : t.progress,
    badges: t.badges,
    createdAt: t.createdAt.toISOString(),
    assignments: t.assignments.map((a) => ({
      id: a.id,
      moduleId: a.moduleId,
      moduleTitle: a.module.title,
      track: a.module.track,
      status: a.status,
      score: a.score,
    })),
  }));

  const totalAssignments = serializedTrainees.reduce(
    (sum, t) => sum + t.assignments.length,
    0,
  );
  const completedAssignments = serializedTrainees.reduce(
    (sum, t) => sum + t.assignments.filter((a) => a.status === 'completed').length,
    0,
  );

  return {
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      track: m.track,
      description: m.description,
      durationMinutes: m.durationMinutes,
      displayOrder: m.displayOrder,
    })),
    tracks: [...tracks.values()],
    trainees: serializedTrainees,
    summary: {
      trainees: serializedTrainees.length,
      certified: serializedTrainees.filter((t) => t.status === 'certified').length,
      inTraining: serializedTrainees.filter((t) => t.status !== 'certified').length,
      completionRate:
        totalAssignments > 0
          ? Math.round((completedAssignments / totalAssignments) * 100)
          : 0,
      assignments: totalAssignments,
      completedAssignments,
    },
  };
}

export async function enrollTrainee(
  input: TrainingEnrollInput,
  restaurantId = env.RESTAURANT_ID,
) {
  const modules = await prisma.trainingModule.findMany({
    where: {
      restaurantId,
      ...(input.tracks.length > 0 ? { track: { in: input.tracks } } : {}),
    },
  });
  const magicLink = `https://shift-happens.local/onboarding/${cryptoRandom()}`;

  const trainee = await prisma.trainee.create({
    data: {
      restaurantId,
      fullName: input.fullName,
      role: input.role,
      mentor: input.mentor ?? null,
      status: 'in_training',
      progress: 0,
      magicLink,
      assignments: {
        create: modules.map((module) => ({
          moduleId: module.id,
          status: 'not_started',
        })),
      },
    },
    include: { assignments: { include: { module: true } } },
  });

  if (input.sendMagicLink) {
    void sendMessage({
      restaurantId,
      channel: 'sms',
      recipients: [input.fullName],
      message: `Welcome to Chefuffle, ${input.fullName}. Your onboarding track is ready: ${magicLink}`,
    }).catch(() => undefined);
  }

  emitRestaurant('BRIEFING_UPDATED', {
    event: 'BRIEFING_UPDATED',
    trainee: { id: trainee.id, fullName: trainee.fullName, role: trainee.role },
    timestamp: new Date().toISOString(),
  }, restaurantId);

  return {
    trainee: {
      id: trainee.id,
      fullName: trainee.fullName,
      role: trainee.role,
      mentor: trainee.mentor,
      status: trainee.status,
      magicLink: trainee.magicLink,
      assignments: trainee.assignments.map((a) => ({
        id: a.id,
        moduleId: a.moduleId,
        moduleTitle: a.module.title,
        status: a.status,
      })),
    },
  };
}

export async function updateTrainingProgress(
  input: {
    traineeId: string;
    moduleId: string;
    status: 'not_started' | 'in_progress' | 'completed' | 'failed';
    score?: number;
  },
  restaurantId = env.RESTAURANT_ID,
) {
  const trainee = await prisma.trainee.findFirst({
    where: { id: input.traineeId, restaurantId },
    include: { assignments: true },
  });
  if (!trainee) throw notFound('Trainee not found');

  await prisma.trainingAssignment.upsert({
    where: {
      traineeId_moduleId: {
        traineeId: input.traineeId,
        moduleId: input.moduleId,
      },
    },
    create: {
      traineeId: input.traineeId,
      moduleId: input.moduleId,
      status: input.status,
      score: input.score ?? null,
    },
    update: {
      status: input.status,
      score: input.score ?? null,
    },
  });

  const assignments = await prisma.trainingAssignment.findMany({
    where: { traineeId: input.traineeId },
  });
  const progress = Math.round(
    (assignments.filter((a) => a.status === 'completed').length /
      Math.max(1, assignments.length)) *
      100,
  );
  const certified = progress >= 100;
  const badges = new Set(trainee.badges);
  if (certified) badges.add('Allergen Guard');

  const updated = await prisma.trainee.update({
    where: { id: input.traineeId },
    data: {
      progress,
      status: certified ? 'certified' : 'in_training',
      badges: [...badges],
    },
    include: { assignments: { include: { module: true } } },
  });

  emitRestaurant('BRIEFING_UPDATED', {
    event: 'BRIEFING_UPDATED',
    trainee: {
      id: updated.id,
      fullName: updated.fullName,
      progress: updated.progress,
      status: updated.status,
    },
    timestamp: new Date().toISOString(),
  }, restaurantId);

  return {
    trainee: {
      id: updated.id,
      fullName: updated.fullName,
      progress: updated.progress,
      status: updated.status,
      badges: updated.badges,
      assignments: updated.assignments.map((a) => ({
        moduleId: a.moduleId,
        moduleTitle: a.module.title,
        status: a.status,
        score: a.score,
      })),
    },
  };
}

function cryptoRandom() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
