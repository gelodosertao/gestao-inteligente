import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, Loader2, Sun, Snowflake, UserPlus, ArrowLeft, User as UserIcon } from 'lucide-react';
import { User, Role } from '../types';
import { dbUsers } from '../services/db';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = useState(false);

  // Login State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<Role>('OPERATOR');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const user = await dbUsers.login(email, password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'Falha ao conectar. Verifique internet ou credenciais.');
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (regPassword.length < 6) throw new Error("A senha deve ter pelo menos 6 dígitos.");

      await dbUsers.register({
        name: regName,
        email: regEmail,
        password: regPassword,
        role: regRole
      });

      setSuccess("Conta criada com sucesso! Faça login.");
      setIsRegistering(false);
      setEmail(regEmail); // Pre-fill login
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Erro ao criar conta.');
    } finally {
      setLoading(false);
    }
  };

  // Componente Visual da Logo Gelo do Sertão
  const GeloDoSertaoLogo = ({ size = 'normal' }: { size?: 'normal' | 'small' }) => {
    const scale = size === 'small' ? 0.6 : 1;
    return (
      <div className="relative flex flex-col items-center justify-center select-none" style={{ transform: `scale(${scale})` }}>
        {/* Top: Sun & Cactus */}
        <div className="w-48 h-24 bg-gradient-to-b from-orange-400 to-orange-500 rounded-t-full relative overflow-hidden z-0 border-4 border-white shadow-sm">
          <div className="absolute bottom-0 w-full h-8 bg-[#d97706]/20 rounded-t-[50%]"></div>
          {/* Cactus Simulation */}
          <div className="absolute bottom-2 left-10 w-2 h-10 bg-amber-900 rounded-t-full">
            <div className="absolute top-2 -left-2 w-2 h-4 bg-amber-900 rounded-l-full rounded-t-full border-b-2 border-orange-500/0 rotate-[-15deg]"></div>
          </div>
          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-3 h-14 bg-amber-900 rounded-t-full">
            <div className="absolute top-4 -right-2 w-2 h-4 bg-amber-900 rounded-r-full rounded-t-full rotate-[15deg]"></div>
            <div className="absolute top-3 -left-2 w-2 h-4 bg-amber-900 rounded-l-full rounded-t-full rotate-[-15deg]"></div>
          </div>
          <div className="absolute bottom-2 right-10 w-2 h-8 bg-amber-900 rounded-t-full"></div>

          {/* Arc Text */}
          <svg className="absolute top-1 left-0 w-full h-full pointer-events-none" viewBox="0 0 200 100">
            <path id="curve" d="M 30,90 A 70,70 0 0,1 170,90" fill="transparent" />
            <text width="200" className="text-[10px] font-bold fill-amber-900 uppercase tracking-widest" style={{ fontSize: '10px' }}>
              <textPath xlinkHref="#curve" startOffset="50%" textAnchor="middle">
                Gelo de Sabor • Cubo • Escama
              </textPath>
            </text>
          </svg>
        </div>

        {/* Middle: Banner */}
        <div className="relative z-20 -mt-4 bg-[#1e40af] text-white py-2 px-8 rounded-lg shadow-lg border-2 border-white transform skew-x-[-5deg]">
          <div className="flex items-center gap-2 transform skew-x-[5deg]">
            <span className="font-black text-3xl tracking-wide drop-shadow-md" style={{ fontFamily: 'Impact, sans-serif' }}>GELO</span>
            <div className="flex flex-col justify-center h-full">
              <span className="text-[8px] font-bold text-orange-400 leading-none">DO</span>
            </div>
            <span className="font-black text-3xl tracking-wide drop-shadow-md" style={{ fontFamily: 'Impact, sans-serif' }}>SERTÃO</span>
          </div>
        </div>

        {/* Bottom: Ice Base */}
        <div className="relative z-10 -mt-6 pt-8 pb-2 px-6 bg-gradient-to-b from-[#3b82f6] to-[#60a5fa] rounded-b-[3rem] w-40 flex justify-center border-b-4 border-white shadow-inner">
          <Snowflake size={40} className="text-white opacity-80 animate-pulse" strokeWidth={2.5} />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-500 border border-slate-200">

        {/* Header Visual */}
        <div className="bg-blue-950 p-8 text-center relative overflow-hidden flex flex-col items-center">

          <div className="absolute -right-10 -top-10 text-orange-500/10">
            <Sun size={200} />
          </div>

          <div className="transform scale-90 md:scale-100 mb-2 filter drop-shadow-2xl">
            <GeloDoSertaoLogo />
          </div>

          <p className="text-blue-200 text-xs mt-4 font-medium tracking-wider uppercase opacity-80 relative z-20">
            {isRegistering ? 'Cadastro de Novo Usuário' : 'Acesso ao Sistema'}
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
          {isRegistering ? (
            // REGISTER FORM
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" required value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-orange-500 transition-all" placeholder="Seu Nome" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-orange-500 transition-all" placeholder="seu@email.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-orange-500 transition-all" placeholder="Mínimo 6 caracteres" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Perfil</label>
                <select value={regRole} onChange={(e) => setRegRole(e.target.value as Role)} className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-orange-500 bg-white">
                  <option value="OPERATOR">Operador (Caixa/Estoque)</option>
                  <option value="ADMIN">Administrador (Sócio)</option>
                </select>
              </div>
              <button type="submit" disabled={loading} className="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-orange-900/20 transition-all mt-4 flex justify-center">
                {loading ? <Loader2 className="animate-spin" /> : 'Criar Conta'}
              </button>
              <button type="button" onClick={() => setIsRegistering(false)} className="w-full text-slate-500 hover:text-slate-700 py-2 font-medium flex items-center justify-center gap-2">
                <ArrowLeft size={16} /> Voltar para Login
              </button>
            </form>
          ) : (
            // LOGIN FORM
            <form onSubmit={handleLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">E-mail Corporativo</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all" placeholder="seu@email.com" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all" placeholder="••••••••" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-700 hover:bg-blue-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-blue-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
              >
                {loading ? <Loader2 className="animate-spin" /> : <>Entrar <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" /></>}
              </button>

              <div className="pt-4 border-t border-slate-100 text-center">
                <p className="text-slate-500 text-sm mb-3">Primeiro acesso?</p>
                <button
                  type="button"
                  onClick={() => setIsRegistering(true)}
                  className="w-full bg-slate-50 hover:bg-slate-100 text-blue-700 border border-slate-200 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus size={18} /> Cadastrar Novo Usuário
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