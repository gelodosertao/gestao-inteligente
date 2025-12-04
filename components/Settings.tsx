import React, { useState } from 'react';
import { User, Role } from '../types';
import { Save, Shield, Globe, Users, Key, FileBadge, CheckCircle, CreditCard, QrCode, Smartphone, Server, Database, Download, Cloud, Trash2, X, Plus } from 'lucide-react';
import { MOCK_PRODUCTS, MOCK_SALES, MOCK_FINANCIALS } from '../constants';

interface SettingsProps {
  currentUser: User;
  onResetData: () => void;
}

const Settings: React.FC<SettingsProps> = ({ currentUser, onResetData }) => {
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'INTEGRATIONS' | 'USERS' | 'PAYMENTS' | 'SYSTEM'>('PROFILE');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // User Management State
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'OPERATOR' as Role, password: '' });

  // SEFAZ Integration State
  const [environment, setEnvironment] = useState<'HOMOLOGATION' | 'PRODUCTION'>('HOMOLOGATION');
  const [certificateName, setCertificateName] = useState('');
  
  const handleSave = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSuccessMsg('Configurações salvas com sucesso!');
      setTimeout(() => setSuccessMsg(''), 3000);
    }, 1500);
  };

  const handleAddUser = () => {
      setLoading(true);
      setTimeout(() => {
          setLoading(false);
          setShowUserModal(false);
          setSuccessMsg('Usuário cadastrado com sucesso!');
          setTimeout(() => setSuccessMsg(''), 3000);
          setNewUser({ name: '', email: '', role: 'OPERATOR', password: '' });
      }, 1000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCertificateName(e.target.files[0].name);
    }
  };

  const handleDownloadBackup = () => {
    const data = {
      products: localStorage.getItem('gelo_products'),
      sales: localStorage.getItem('gelo_sales'),
      financials: localStorage.getItem('gelo_financials'),
      timestamp: new Date().toISOString()
    };
    const jsonString = `data:text/json;chatset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const link = document.createElement("a");
    link.href = jsonString;
    link.download = `backup_gelo_do_sertao_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  if (currentUser.role !== 'ADMIN') {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
              <Shield size={64} className="mb-4 text-slate-300" />
              <h2 className="text-xl font-bold text-slate-600">Acesso Restrito</h2>
              <p>Apenas administradores podem acessar as configurações do sistema.</p>
          </div>
      )
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Configurações</h2>
        <p className="text-slate-500">Gerencie integrações, usuários e dados da empresa.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar Settings */}
        <div className="w-full lg:w-64 flex flex-col gap-2">
          <button 
            onClick={() => setActiveTab('PROFILE')}
            className={`text-left px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-colors ${activeTab === 'PROFILE' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <Shield size={18} /> Meu Perfil
          </button>
          <button 
            onClick={() => setActiveTab('PAYMENTS')}
            className={`text-left px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-colors ${activeTab === 'PAYMENTS' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <CreditCard size={18} /> Pagamentos & Máquinas
          </button>
          <button 
            onClick={() => setActiveTab('INTEGRATIONS')}
            className={`text-left px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-colors ${activeTab === 'INTEGRATIONS' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <Globe size={18} /> Integrações (SEFAZ)
          </button>
          <button 
            onClick={() => setActiveTab('USERS')}
            className={`text-left px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-colors ${activeTab === 'USERS' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <Users size={18} /> Usuários e Acesso
          </button>
          <button 
            onClick={() => setActiveTab('SYSTEM')}
            className={`text-left px-4 py-3 rounded-xl font-medium flex items-center gap-3 transition-colors ${activeTab === 'SYSTEM' ? 'bg-white text-orange-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            <Server size={18} /> Sistema & Backup
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 min-h-[500px]">
          
          {/* PROFILE TAB */}
          {activeTab === 'PROFILE' && (
             <div className="max-w-xl space-y-6">
                <div className="flex items-center gap-4 mb-6">
                   <div className="w-20 h-20 bg-blue-900 rounded-full flex items-center justify-center text-white text-2xl font-bold ring-4 ring-orange-100">
                      {currentUser.avatarInitials}
                   </div>
                   <div>
                      <h3 className="font-bold text-lg text-slate-800">{currentUser.name}</h3>
                      <p className="text-slate-500">{currentUser.email}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded uppercase">{currentUser.role}</span>
                   </div>
                </div>

                <div className="grid gap-4">
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                      <input type="text" defaultValue={currentUser.name} className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                      <input type="email" defaultValue={currentUser.email} disabled className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500 cursor-not-allowed" />
                   </div>
                   
                   <div className="pt-4 border-t border-slate-100">
                      <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Key size={16} /> Alterar Senha</h4>
                      <div className="space-y-3">
                        <input type="password" placeholder="Senha Atual" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        <input type="password" placeholder="Nova Senha" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        <input type="password" placeholder="Confirmar Nova Senha" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </div>
                   </div>
                </div>
             </div>
          )}

          {/* PAYMENTS TAB */}
          {activeTab === 'PAYMENTS' && (
             <div className="max-w-2xl space-y-8">
                <div>
                   <h3 className="text-lg font-bold text-slate-800 mb-1">Meios de Pagamento</h3>
                   <p className="text-sm text-slate-500">Configure Pix e Maquininhas para automatizar suas vendas.</p>
                </div>

                {/* PIX CONFIG */}
                <div className="p-5 bg-emerald-50 rounded-xl border border-emerald-100 space-y-4">
                   <div className="flex items-center gap-3 text-emerald-800">
                      <QrCode size={24} />
                      <h4 className="font-bold">Configuração PIX</h4>
                   </div>
                   <div className="grid md:grid-cols-2 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Chave</label>
                         <select className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white">
                            <option>CNPJ</option>
                            <option>E-mail</option>
                            <option>Celular</option>
                            <option>Chave Aleatória</option>
                         </select>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Chave Pix</label>
                         <input type="text" placeholder="00.000.000/0001-00" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                      </div>
                   </div>
                   <p className="text-xs text-emerald-600 font-medium">
                      * Ao configurar, o QR Code será gerado automaticamente no PDV.
                   </p>
                </div>

                {/* CARD MACHINE CONFIG */}
                <div className="p-5 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-slate-800">
                         <Smartphone size={24} className="text-blue-600" />
                         <h4 className="font-bold">Maquininhas de Cartão</h4>
                      </div>
                      <span className="text-xs bg-slate-200 px-2 py-1 rounded font-bold text-slate-600">Modo: Manual / TEF</span>
                   </div>

                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-600 mb-1">Taxa Débito (%)</label>
                         <div className="relative">
                            <input type="number" defaultValue={1.20} className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg" />
                            <span className="absolute right-3 top-2 text-slate-400 font-bold">%</span>
                         </div>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-600 mb-1">Taxa Crédito (%)</label>
                         <div className="relative">
                            <input type="number" defaultValue={2.50} className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg" />
                            <span className="absolute right-3 top-2 text-slate-400 font-bold">%</span>
                         </div>
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-600 mb-1">Taxa Parcelado (%)</label>
                         <div className="relative">
                            <input type="number" defaultValue={3.90} className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-lg" />
                            <span className="absolute right-3 top-2 text-slate-400 font-bold">%</span>
                         </div>
                      </div>
                   </div>

                   <div className="pt-4 border-t border-slate-200 mt-4">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Token de Integração (API Stone/PagSeguro/Cielo)</label>
                      <input type="password" placeholder="Ex: sk_live_..." className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white" />
                      <p className="text-xs text-slate-500 mt-1">Insira apenas se for utilizar integração automática (TEF Web).</p>
                   </div>
                </div>
             </div>
          )}

          {/* INTEGRATIONS TAB */}
          {activeTab === 'INTEGRATIONS' && (
             <div className="max-w-2xl space-y-8">
                <div>
                   <h3 className="text-lg font-bold text-slate-800 mb-1">Nota Fiscal Eletrônica (NF-e/NFC-e)</h3>
                   <p className="text-sm text-slate-500">Configure a comunicação com a SEFAZ do seu estado.</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                   <div className="flex justify-between items-center">
                      <span className="font-medium text-slate-700">Ambiente de Emissão</span>
                      <div className="flex bg-slate-200 p-1 rounded-lg">
                         <button 
                           onClick={() => setEnvironment('HOMOLOGATION')}
                           className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${environment === 'HOMOLOGATION' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                         >
                           Homologação (Teste)
                         </button>
                         <button 
                           onClick={() => setEnvironment('PRODUCTION')}
                           className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${environment === 'PRODUCTION' ? 'bg-white shadow text-red-600' : 'text-slate-500'}`}
                         >
                           Produção
                         </button>
                      </div>
                   </div>

                   <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700">Certificado Digital (A1)</label>
                      <div className="flex items-center gap-3">
                         <label className="flex-1 cursor-pointer">
                            <input type="file" className="hidden" accept=".pfx" onChange={handleFileUpload} />
                            <div className="w-full border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center text-slate-500 hover:bg-white hover:border-orange-500 transition-colors">
                               <FileBadge size={24} className="mb-2" />
                               {certificateName ? <span className="text-orange-600 font-bold">{certificateName}</span> : <span>Clique para carregar arquivo .PFX</span>}
                            </div>
                         </label>
                      </div>
                   </div>

                   <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Senha do Certificado</label>
                      <input type="password" placeholder="••••••" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                   </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                   <h4 className="font-bold text-slate-800">Parâmetros NFC-e</h4>
                   <div className="grid grid-cols-2 gap-4">
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">CSC (Token ID)</label>
                         <input type="text" placeholder="Ex: 000001" className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </div>
                      <div>
                         <label className="block text-sm font-medium text-slate-700 mb-1">Código CSC</label>
                         <input type="text" placeholder="Ex: A1B2C3D4..." className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      </div>
                   </div>
                </div>
             </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'USERS' && (
             <div className="space-y-6">
                <div className="flex justify-between items-center">
                   <div>
                      <h3 className="text-lg font-bold text-slate-800">Usuários do Sistema</h3>
                      <p className="text-sm text-slate-500">Controle quem tem acesso e quais permissões.</p>
                   </div>
                   <button 
                     onClick={() => setShowUserModal(true)}
                     className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2"
                   >
                      <Plus size={16} /> Adicionar Usuário
                   </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                   <table className="w-full text-left">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                         <tr>
                            <th className="p-4">Usuário</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Perfil</th>
                            <th className="p-4 text-right">Status</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                         <tr>
                            <td className="p-4 font-bold text-slate-800">João Pedro</td>
                            <td className="p-4 text-slate-600">admin@gelodosertao.com</td>
                            <td className="p-4"><span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">ADMINISTRADOR</span></td>
                            <td className="p-4 text-right"><span className="text-green-600 font-bold">Ativo</span></td>
                         </tr>
                         <tr>
                            <td className="p-4 font-bold text-slate-800">Operador Caixa</td>
                            <td className="p-4 text-slate-600">caixa@gelodosertao.com</td>
                            <td className="p-4"><span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-bold">OPERADOR</span></td>
                            <td className="p-4 text-right"><span className="text-green-600 font-bold">Ativo</span></td>
                         </tr>
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {/* SYSTEM & DEPLOY TAB */}
          {activeTab === 'SYSTEM' && (
             <div className="space-y-8 max-w-2xl">
                <div>
                   <h3 className="text-lg font-bold text-slate-800 mb-1">Status do Sistema e Hospedagem</h3>
                   <p className="text-sm text-slate-500">Monitoramento do servidor e opções de backup.</p>
                </div>

                {/* Server Status */}
                <div className="bg-slate-900 text-white p-5 rounded-xl shadow-lg flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="p-3 bg-white/10 rounded-lg">
                        <Server size={24} className="text-green-400" />
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Status do Servidor</p>
                        <h4 className="text-xl font-bold flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                          Online (Local)
                        </h4>
                      </div>
                   </div>
                   <div className="text-right hidden sm:block">
                      <p className="text-xs text-slate-400">Latência</p>
                      <p className="font-mono text-green-400">24ms</p>
                   </div>
                </div>

                {/* Deployment Recommendation */}
                <div className="border border-slate-200 rounded-xl p-5 bg-slate-50">
                    <div className="flex items-center gap-2 mb-3">
                       <Cloud className="text-blue-600" size={20} />
                       <h4 className="font-bold text-slate-800">Pronto para Hospedagem (Deploy)</h4>
                    </div>
                    <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                       Este sistema está otimizado para rodar em arquitetura Serverless. Recomendamos os seguintes provedores gratuitos para iniciar:
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                       <div className="bg-white p-3 rounded border border-slate-200 text-center">
                          <span className="block font-bold text-slate-800">Vercel</span>
                          <span className="text-xs text-green-600">Recomendado (Frontend)</span>
                       </div>
                       <div className="bg-white p-3 rounded border border-slate-200 text-center">
                          <span className="block font-bold text-slate-800">Supabase</span>
                          <span className="text-xs text-blue-600">Banco de Dados</span>
                       </div>
                    </div>
                    <div className="text-xs text-slate-500 bg-blue-50 p-3 rounded border border-blue-100">
                       <strong>Dica Técnica:</strong> Para subir este código, conecte seu repositório Git ao Vercel. O build será automático.
                    </div>
                </div>

                {/* Data Backup */}
                <div className="border border-slate-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                       <Database className="text-orange-600" size={20} />
                       <h4 className="font-bold text-slate-800">Backup de Dados Local</h4>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">
                       O sistema está utilizando o <strong>LocalStorage</strong> do navegador para persistir dados.
                    </p>
                    <div className="flex flex-col gap-3">
                       <button 
                          onClick={handleDownloadBackup}
                          className="w-full border-2 border-slate-200 hover:border-blue-500 hover:text-blue-600 text-slate-600 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 group"
                       >
                          <Download size={18} className="group-hover:translate-y-1 transition-transform" /> Baixar Backup (.JSON)
                       </button>

                       <button 
                          onClick={onResetData}
                          className="w-full bg-rose-50 border-2 border-rose-100 hover:border-rose-500 text-rose-600 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2"
                       >
                          <Trash2 size={18} /> Resetar Dados de Fábrica
                       </button>
                    </div>
                </div>
             </div>
          )}

          {/* Action Footer */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
             {successMsg && (
                <span className="text-green-600 font-medium flex items-center gap-1 animate-in fade-in">
                   <CheckCircle size={18} /> {successMsg}
                </span>
             )}
             <button 
               onClick={handleSave}
               disabled={loading}
               className="bg-blue-800 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-900/10 transition-all disabled:opacity-70"
             >
               {loading ? 'Salvando...' : <><Save size={18} /> Salvar Alterações</>}
             </button>
          </div>
        </div>
      </div>

      {/* MODAL CADASTRAR USUÁRIO */}
      {showUserModal && (
        <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
             <div className="p-4 bg-orange-500 text-white flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                   <Users size={20} /> Novo Usuário
                </h3>
                <button onClick={() => setShowUserModal(false)}><X size={20}/></button>
             </div>
             
             <div className="p-6 space-y-4">
                <div>
                   <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                   <input 
                     type="text" 
                     className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                     value={newUser.name}
                     onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                   />
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">E-mail Corporativo</label>
                    <input 
                      type="email" 
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Perfil de Acesso</label>
                    <select 
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900 font-medium"
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value as Role})}
                    >
                        <option value="OPERATOR">Operador (PDV/Estoque)</option>
                        <option value="ADMIN">Administrador (Total)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Senha Inicial</label>
                    <input 
                      type="password" 
                      className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-white text-slate-900"
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                    />
                </div>

                <div className="pt-2">
                    <button 
                      onClick={handleAddUser}
                      className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20"
                    >
                      Criar Conta
                    </button>
                </div>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;