import type { Metadata } from 'next';
import SetupPanel from './SetupPanel';

export const metadata: Metadata = {
  title: 'Setup & diagnostics',
  description: 'Check that this terminal can reach the Whiteout server, database and realtime gateway.',
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return <SetupPanel />;
}
