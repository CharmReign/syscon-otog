import { Open_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import sysconIcon from './syscon-icon.png';

const openSans = Open_Sans({ subsets: ['latin'], variable: '--font-open-sans', display: 'swap' });

export const metadata = {
  title: 'Syscon OneTeamOneGoal',
  description:
    'OneTeamOneGoal brings Syscon product and support knowledge into one place: Level Up quizzes, client defect triage, the AS-IS Navigator and release sanity health checks.',
  icons: {
    icon: sysconIcon.src,
    apple: sysconIcon.src,
  },
  openGraph: {
    title: 'Syscon OneTeamOneGoal',
    description: 'Internal knowledge, learning and engineering support for Syscon teams.',
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={openSans.variable} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
