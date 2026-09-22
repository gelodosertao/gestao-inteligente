import React, { useState } from 'react';
import { ArrowRight, Loader2, Lock, Mail, Sun } from 'lucide-react';
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
    <div className="min-h-dvh w-full bg-slate-100 flex items-start sm:items-center justify-center p-4 pt-safe-offset-4 sm:p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-500 border border-slate-200">
        <div className="bg-blue-950 p-8 text-center relative overflow-hidden flex flex-col items-center">
          <div className="absolute -right-10 -top-10 text-orange-500/10" aria-hidden="true">
            <Sun size={200} />
          </div>
          <div className="transform scale-90 md:scale-100 mb-2 filter drop-shadow-2xl">
            <img src="/logo.png" alt="Gelo do Sertão" className="h-40 w-auto object-contain" />
          </div>
          <p className="text-blue-200 text-xs mt-4 font-medium tracking-wider uppercase opacity-80 relative z-20">
            Acesso ao Sistema
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-rose-50 p-4 border-b border-rose-100 text-rose-600 text-center font-bold text-sm">
            {error}
          </div>
        )}

        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-2">E-mail corporativo</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} aria-hidden="true" />
                <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all" placeholder="seu@email.com" />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-2">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} aria-hidden="true" />
                <input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all" placeholder="••••••••••••" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-blue-700 hover:bg-blue-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group">
              {loading ? <Loader2 className="animate-spin" aria-label="Entrando" /> : <>Entrar <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
