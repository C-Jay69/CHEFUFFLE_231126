import architectBinder from './architect';
import briefingBinder from './briefing';
import floorPlanBinder from './floor-plan';
import inventoryBinder from './inventory';
import kdsBinder from './kds';
import mobileBinder from './mobile';
import onboardingBinder from './onboarding';
import posBinder from './pos';
import reservationsBinder from './reservations';
import schedulingBinder from './scheduling';
import type { Binder } from './types';

const binders: Record<string, Binder> = {
  pos: posBinder,
  kds: kdsBinder,
  'floor-plan': floorPlanBinder,
  mobile: mobileBinder,
  reservations: reservationsBinder,
  inventory: inventoryBinder,
  scheduling: schedulingBinder,
  briefing: briefingBinder,
  onboarding: onboardingBinder,
  architect: architectBinder,
};

export function getBinder(screen: string): Binder | undefined {
  return binders[screen];
}
