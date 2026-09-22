import React, { useState } from 'react';
import { AlertTriangle, Loader2, Lock, LogOut } from 'lucide-react';
import type { User } from '../types';
import { dbUsers } from '../services/db';
import { isStrongPassword, isTemporaryPasswordExpired } from '../security/userProfile';

interface PasswordChangeProps {
  user: User;
  onChanged: (user: User) => void;
  onLogout: () => Promise<void>;
}

const PasswordChange: React.FC<PasswordChangeProps> = ({ user, onChanged, onLogout }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const expired = isTemporaryPasswordExpired(user);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!isStrongPassword(newPassword)) {
      setError('Use de 12 a 128 caracteres, com maiúscula, minúscula, número e símbolo.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      onChanged(await dbUsers.changeOwnPassword(newPassword));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-dvh bg-slate-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl" aria-labelledby="password-title">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-950 text-white">
          {expired ? <AlertTriangle aria-hidden="true" /> : <Lock aria-hidden="true" />}
        </div>
        <h1 id="password-title" className="text-center text-2xl font-black text-slate-900">
          {expired ? 'Senha temporária expirada' : 'Crie sua senha definitiva'}
        </h1>
        <p className="mt-3 text-center text-sm leading-6 text-slate-600">
          {expired
            ? 'A janela de 24 horas terminou. Peça ao administrador da empresa uma nova senha temporária.'
            : 'Antes de acessar os dados da empresa, substitua a senha temporária recebida.'}
        </p>

        {error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}

        {!expired && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="new-password" className="mb-1 block text-sm font-semibold text-slate-700">Nova senha</label>
              <input id="new-password" type="password" autoComplete="new-password" required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500" />
              <p className="mt-1 text-xs text-slate-500">12 caracteres ou mais, incluindo maiúscula, minúscula, número e símbolo.</p>
            </div>
            <div>
              <label htmlFor="confirm-password" className="mb-1 block text-sm font-semibold text-slate-700">Confirme a nova senha</label>
              <input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500" />
            </div>
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-60">
              {loading ? <Loader2 className="animate-spin" aria-label="Alterando senha" /> : 'Alterar senha'}
            </button>
          </form>
        )}

        <button type="button" onClick={() => void onLogout()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-slate-600 hover:bg-slate-100">
          <LogOut size={18} aria-hidden="true" /> Sair
        </button>
      </section>
    </main>
  );
};

export default PasswordChange;
