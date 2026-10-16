'use client';

import { useState } from 'react';
import { User, ShieldCheck, CheckCircle2, Eye, EyeOff, GraduationCap, Bug, Compass, Rocket } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LogoMark } from '@/components/brand/logo';
import { CreditFooter } from '@/components/common/credit-footer';

// Demo shortcuts fill in the seeded accounts. They're left out of production builds,
// where demo users aren't created either (see SEED_DEMO_USERS).
const SHOW_DEMO = process.env.NODE_ENV !== 'production';
const DEMO_ACCOUNTS = [
  { label: 'Employee', username: 'employee', icon: User, desc: 'Learn, take quizzes, use every module' },
  { label: 'Admin', username: 'admin', icon: ShieldCheck, desc: 'Everything an employee can do, plus upload sources and manage quizzes' },
];

const MODULES = [
  { icon: Bug, label: 'Client Defect Triage' },
  { icon: Compass, label: 'AS-IS Navigator' },
  { icon: Rocket, label: 'Release Sanity Health Check' },
  { icon: GraduationCap, label: 'Level Up: Product & Support' },
];

export function LoginScreen({ onLogin }) {
  const [demo, setDemo] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const pickDemo = (i) => {
    setDemo(i);
    setUsername(DEMO_ACCOUNTS[i].username);
    setPassword('demo1234');
    setError('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err.message || 'Sign-in failed. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-[32rem] h-[32rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 w-[36rem] h-[36rem] rounded-full bg-brand-400/10 blur-3xl" />
      </div>

      <div className="min-h-screen flex items-center justify-center px-4 pt-12 pb-16 relative z-10">
        <div className="w-full max-w-5xl glass rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
          <div className="relative min-h-[520px] hidden md:block">
            <img src="/syscon-login-bg.jpg" alt="" className="absolute inset-0 w-full h-full object-cover object-[70%_center]" />
            <div className="absolute inset-0 bg-gradient-to-br from-[#1e3668]/95 via-[#2a4a7f]/85 to-[#0f1d3a]/90" />
            <div className="relative z-10 p-8 flex flex-col h-full text-white">
              <div className="flex items-center gap-3">
                <LogoMark className="w-12 h-12" />
                <div>
                  <div className="text-2xl font-bold tracking-tight">OneTeamOneGoal</div>
                  <div className="text-xs text-brand-200 font-semibold">Syscon</div>
                </div>
              </div>
              <div className="flex-1 flex flex-col justify-center py-8">
                <div className="text-3xl font-bold leading-tight mb-3">Our knowledge, <span className="text-brand-200">in one place.</span></div>
                <p className="text-white/80 text-sm leading-relaxed max-w-sm">
                  Learn the product, test what you know, and find the documentation and tickets you need without searching five systems.
                </p>
                <ul className="mt-6 space-y-2.5">
                  {MODULES.map(m => (
                    <li key={m.label} className="flex items-center gap-2.5 text-sm text-white/85">
                      <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center"><m.icon className="w-3.5 h-3.5 text-brand-200" /></span>
                      {m.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <form onSubmit={submit} className="min-w-0 p-6 sm:p-8 md:p-10 flex flex-col justify-center">
            <div className="md:hidden flex items-center gap-2 mb-6">
              <LogoMark className="w-9 h-9" />
              <span className="font-bold text-lg">OneTeamOneGoal</span>
            </div>
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sign in</h1>
              <p className="text-sm text-muted-foreground mt-1">Use your OneTeamOneGoal account.</p>
            </div>

            {SHOW_DEMO && (
              <div className="mb-5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Demo accounts</div>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Demo account">
                  {DEMO_ACCOUNTS.map((a, i) => (
                    <button
                      key={a.label} type="button" role="radio" aria-checked={demo === i} onClick={() => pickDemo(i)}
                      className={`relative flex items-center gap-2 rounded-lg border p-2.5 text-left transition ${demo === i ? 'border-primary bg-primary/10' : 'hover:border-primary/50'}`}
                    >
                      <span className="w-8 h-8 rounded-md flex items-center justify-center bg-primary/15 text-primary"><a.icon className="w-4 h-4" /></span>
                      <span className="text-sm font-semibold">{a.label}</span>
                      {demo === i && <CheckCircle2 className="absolute top-1.5 right-1.5 w-3.5 h-3.5 text-primary" />}
                    </button>
                  ))}
                </div>
                {demo !== null && <p className="text-[11px] text-muted-foreground mt-2">{DEMO_ACCOUNTS[demo].desc}</p>}
              </div>
            )}

            <label htmlFor="username" className="text-xs font-semibold text-muted-foreground mb-1.5">Username</label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="h-11 mb-4" autoComplete="username" required />

            <label htmlFor="password" className="text-xs font-semibold text-muted-foreground mb-1.5">Password</label>
            <div className="relative mb-5">
              <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pr-11" autoComplete="current-password" required />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting || !username || !password} className="h-11 font-semibold text-base">
              {submitting ? <><span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" /> Signing in…</> : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
      <CreditFooter className="absolute bottom-4 left-0 right-0 z-20" />
    </div>
  );
}
