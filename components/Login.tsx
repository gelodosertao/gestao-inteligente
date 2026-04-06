import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, Loader2, UserPlus, ArrowLeft, User as UserIcon, Building2, CreditCard } from 'lucide-react';
import { User } from '../types';
import { dbUsers, dbTenants } from '../services/db';

interface LoginProps {
  onLogin: (user: User) => void;
  onOpenMenu: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onOpenMenu }) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER_COMPANY'>('LOGIN');

  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register Company State
  const [regCompanyName, setRegCompanyName] = useState('');
  const [regCnpj, setRegCnpj] = useState('');
  const [regOwnerName, setRegOwnerName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await dbUsers.login(email.trim().toLowerCase(), password);
      onLogin(user);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || 'Falha ao conectar. Verifique internet ou credenciais.');
      setLoading(false);
    }
  };

  const handleRegisterCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (regPassword.length < 6) throw new Error("A senha deve ter pelo menos 6 dígitos.");
      if (regCnpj.length < 14) throw new Error("Por favor, insira um CNPJ válido.");

      await dbTenants.registerCompany({
        companyName: regCompanyName,
        cnpj: regCnpj,
        ownerName: regOwnerName,
        ownerEmail: regEmail.trim().toLowerCase(),
        ownerPassword: regPassword
      });

      setSuccess("Empresa cadastrada com sucesso! Bem-vindo ao G.AI. Faça login.");
      setMode('LOGIN');
      setEmail(regEmail); // Pre-fill login
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl shadow-gai-navy/10 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-500 border border-slate-100">

        {/* Header Visual */}
        <div className="bg-gai-navy p-10 text-center relative overflow-hidden flex flex-col items-center">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gai-tech to-transparent scale-150"></div>

          <div className="transform scale-90 md:scale-110 mb-4 filter drop-shadow-lg relative z-10 bg-white p-4 rounded-2xl">
            <img src="/logo_gai.png" alt="G.AI" className="h-20 w-auto object-contain" />
          </div>

          <h2 className="text-white text-lg font-bold tracking-tight relative z-10">
            {mode === 'REGISTER_COMPANY' ? 'Cadastre sua Empresa' : 'Bem-vindo ao G.AI'}
          </h2>
          <p className="text-gai-cyan text-xs opacity-80 mt-1 relative z-10">
            {mode === 'REGISTER_COMPANY' ? 'Novo por aqui? Vamos configurar seu sistema.' : 'Gestão Auto Inteligente'}
          </p>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-50 p-4 border-b border-green-100 text-green-700 text-center font-bold text-sm">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-rose-50 p-4 border-b border-rose-100 text-rose-600 text-center font-bold text-sm">
            {error}
          </div>
        )}

        <div className="p-8">
          {mode === 'REGISTER_COMPANY' ? (
            // REGISTER COMPANY FORM
            <form onSubmit={handleRegisterCompany} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nome da Empresa</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" required value={regCompanyName} onChange={(e) => setRegCompanyName(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-gai-tech focus:border-transparent transition-all" placeholder="Nome Fantasia" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">CNPJ</label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" required value={regCnpj} onChange={(e) => setRegCnpj(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-gai-tech focus:border-transparent transition-all" placeholder="Somente números" />
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100 my-4"></div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Seu Nome (Administrador)</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" required value={regOwnerName} onChange={(e) => setRegOwnerName(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-gai-tech focus:border-transparent transition-all" placeholder="Nome Completo" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-gai-tech focus:border-transparent transition-all" placeholder="seu@email.com" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-gai-tech focus:border-transparent transition-all" placeholder="Mínimo 6 caracteres" />
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full bg-gai-tech hover:bg-gai-navy text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-gai-tech/20 transition-all mt-4 flex justify-center uppercase tracking-widest">
                {loading ? <Loader2 className="animate-spin" /> : 'Criar Minha Empresa'}
              </button>

              <button type="button" onClick={() => setMode('LOGIN')} className="w-full text-slate-500 hover:text-slate-700 py-2 font-medium flex items-center justify-center gap-2 text-sm">
                <ArrowLeft size={16} /> Voltar para Login
              </button>
            </form>
          ) : (
            // LOGIN FORM
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">E-mail Corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-gai-tech focus:border-transparent outline-none transition-all" placeholder="seu@email.com" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-gai-tech focus:border-transparent outline-none transition-all" placeholder="••••••••" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gai-navy hover:bg-slate-800 text-white py-4 rounded-xl font-bold text-lg shadow-xl shadow-gai-navy/20 transition-all flex items-center justify-center gap-2 group"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Entrar no Sistema <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
              </button>

              <div className="flex flex-col gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setMode('REGISTER_COMPANY')}
                  className="w-full flex items-center justify-center gap-2 text-gai-tech font-bold hover:text-gai-navy transition-colors py-2 text-sm"
                >
                  <UserPlus size={18} /> Quero cadastrar minha empresa
                </button>
                <button
                  type="button"
                  onClick={onOpenMenu}
                  className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 transition-colors font-medium text-sm"
                >
                  Continuar como visitante
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;