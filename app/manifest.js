import sysconIcon from './syscon-icon.png';

export default function manifest() {
  return {
    name: 'Syscon OneTeamOneGoal',
    short_name: 'OneTeamOneGoal',
    description: 'Internal knowledge, learning and engineering support: Level Up quizzes, defect triage, AS-IS navigation and release health checks.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a1b22',
    theme_color: '#0a1b22',
    icons: [
      { src: sysconIcon.src, type: 'image/png' },
    ],
  };
}
