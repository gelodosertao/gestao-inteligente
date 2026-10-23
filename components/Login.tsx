import React, { useState } from 'react';
import { ArrowRight, Loader2, Lock, Mail } from 'lucide-react';
import { User } from '../types';
import { dbUsers } from '../services/db';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();

    if (lockoutUntil && Date.now() < lockoutUntil) {
      const remainingSeconds = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`Muitas tentativas falhas. Tente novamente em ${remainingSeconds} segundos.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const user = await dbUsers.login(email.trim().toLowerCase(), password);
      setFailedAttempts(0);
      setLockoutUntil(null);
      onLogin(user);
    } catch (caught) {
      console.error('Login error:', caught);
      const newAttempts = failedAttempts + 1;
      setFailedAttempts(newAttempts);

      if (newAttempts >= 5) {
        setLockoutUntil(Date.now() + 30_000);
        setError('Muitas tentativas falhas. Aguarde 30 segundos antes de tentar novamente.');
      } else {
        setError(caught instanceof Error ? caught.message : 'Falha ao conectar. Verifique internet ou credenciais.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-world min-h-dvh w-full flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-8">
      <div className="login-panel max-w-5xl w-full overflow-hidden flex flex-col md:flex-row animate-in fade-in duration-500">
        <div className="login-brand p-8 text-center relative overflow-hidden flex flex-col items-center justify-center md:w-5/12">
          <div className="transform scale-90 md:scale-100 mb-2 filter drop-shadow-2xl">
            <img src="/logo.png" alt="Gelo do Sertão" className="h-40 w-auto object-contain" />
          </div>
          <h1 className="text-blue-100 text-base mt-4 font-semibold relative z-20">Acesso ao sistema</h1>
        </div>

        <div className="login-form-panel p-8 md:px-14 md:py-16 md:w-7/12 flex items-center">
          <form onSubmit={handleLogin} className="space-y-6 w-full">
            {error && (
              <div id="login-error" role="alert" className="bg-rose-50 p-4 border border-rose-200 text-rose-800 font-semibold text-sm">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-2">E-mail corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} aria-hidden="true" />
                <input id="login-email" type="email" autoComplete="username" required aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} value={email} onChange={(event) => setEmail(event.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all" placeholder="seu@email.com" />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-2">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} aria-hidden="true" />
                <input id="login-password" type="password" autoComplete="current-password" required aria-invalid={Boolean(error)} aria-describedby={error ? 'login-error' : undefined} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all" placeholder="••••••••••••" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="login-submit w-full text-white py-3 font-bold text-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group">
              {loading ? <Loader2 className="animate-spin" aria-label="Entrando" /> : <>Entrar <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
