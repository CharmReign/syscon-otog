import sysconLogo from '@/app/syscon-logo.png';

// White disc behind the navy seal keeps it legible on dark and photo backgrounds.
export const LogoMark = ({ className = 'w-9 h-9' }) => (
  <img src={sysconLogo.src} alt="" aria-hidden="true" className={`${className} shrink-0 rounded-full bg-white p-0.5 drop-shadow-lg object-contain`} />
);

export const Logo = ({ className = '' }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <LogoMark />
    <div className="font-bold text-xl tracking-tight">OneTeamOneGoal</div>
  </div>
);
