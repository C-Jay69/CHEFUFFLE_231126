import { notFound } from 'next/navigation';
import ScreenShell from '@/components/ScreenShell';
import { screenKeys, screens } from '@/lib/screens';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return screenKeys.map((screen) => ({ screen }));
}

export function generateMetadata({ params }: { params: { screen: string } }) {
  const definition = screens[params.screen];
  return {
    title: definition?.title ?? 'SHIFT HAPPENS!',
  };
}

export default function ScreenPage({ params }: { params: { screen: string } }) {
  if (!screens[params.screen]) notFound();
  return <ScreenShell screen={params.screen} />;
}
