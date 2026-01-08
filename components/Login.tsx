import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, Loader2, Sun, Snowflake, UserPlus, ArrowLeft, User as UserIcon, Store } from 'lucide-react';
import { User, Role } from '../types';
import { dbUsers } from '../services/db';

interface LoginProps {
  onLogin: (user: User) => void;
  onOpenMenu: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin, onOpenMenu }) => {
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
      console.error("Login error:", err);
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



  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-500 border border-slate-200">

        {/* Header Visual */}
        <div className="bg-blue-950 p-8 text-center relative overflow-hidden flex flex-col items-center">

          <div className="absolute -right-10 -top-10 text-orange-500/10">
            <Sun size={200} />
          </div>

          <div className="transform scale-90 md:scale-100 mb-2 filter drop-shadow-2xl">
            <img src="/logo.png" alt="Gelo do Sertão" className="h-40 w-auto object-contain" />
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
                  <option value="FACTORY">Fábrica (Produção)</option>
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

              <div className="pt-4 border-t border-slate-100 text-center space-y-3">
                <button
                  type="button"
                  onClick={onOpenMenu}
                  className="w-full bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Store size={18} /> Acessar Cardápio Digital
                </button>

                <div>
                  <p className="text-slate-500 text-sm mb-2">Primeiro acesso?</p>
                  <button
                    type="button"
                    onClick={() => setIsRegistering(true)}
                    className="w-full bg-slate-50 hover:bg-slate-100 text-blue-700 border border-slate-200 py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <UserPlus size={18} /> Cadastrar Novo Usuário
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;