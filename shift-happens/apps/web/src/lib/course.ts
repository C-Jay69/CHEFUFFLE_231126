export type Course = 'starter' | 'main' | 'dessert' | 'drink';

export const COURSE_LABELS: Record<Course, string> = {
  starter: 'Starter',
  main: 'Main',
  dessert: 'Dessert',
  drink: 'Drink',
};

/**
 * Client-side mirror of the shared course rule. Keep this in the web bundle
 * (instead of importing the shared package) so Zod and server schemas never
 * reach the browser bundle.
 */
export function courseForCategory(
  category: string | null | undefined,
  itemName = '',
): Course {
  const c = (category ?? '').toLowerCase();
  const n = itemName.toLowerCase();
  if (c.includes('dessert')) return 'dessert';
  if (
    c.includes('cocktail') ||
    c.includes('margarita') ||
    c.includes('wine') ||
    c.includes('drink') ||
    c.includes('beer') ||
    c.includes('beverage')
  ) {
    return 'drink';
  }
  if (c.includes('eats') && /(cheesecake|brûlée|brulee|crème|creme)/.test(n)) {
    return 'dessert';
  }
  if (
    c.includes('start') ||
    c.includes('share') ||
    c.includes('eats') ||
    c.includes('feature') ||
    c.includes('sushi') ||
    c.includes('green') ||
    c.includes('salad') ||
    c.includes('appet')
  ) {
    return 'starter';
  }
  return 'main';
}
