import React, { useState, useEffect } from 'react';
import { StoreSettings } from '../types';
import { dbSettings } from '../services/db';
import { supabase } from '../services/supabase';
import { Save, Image, Store, Clock, Phone, MapPin, Palette, ArrowLeft, Upload } from 'lucide-react';

interface MenuConfigProps {
    onBack: () => void;
    tenantId: string;
}

const MenuConfig: React.FC<MenuConfigProps> = ({ onBack, tenantId }) => {
    const [settings, setSettings] = useState<StoreSettings>({
        id: 'default',
        storeName: '',
        phone: '',
        address: '',
        openingHours: '',
        coverImage: '',
        backgroundImage: '',
        logoImage: '',
        primaryColor: '#2563eb'
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const data = await dbSettings.get(tenantId);
            if (data) {
                setSettings(data);
            } else {
                // Defaults
                setSettings({
                    id: 'default',
                    storeName: 'Gelo do Sertão',
                    phone: '5577998129383',
                    address: '',
                    openingHours: 'Seg-Sex: 08:00 - 18:00',
                    coverImage: '',
                    backgroundImage: '',
                    logoImage: '',
                    primaryColor: '#2563eb'
                });
            }
        } catch (error) {
            console.error("Erro ao carregar configurações:", error);
            alert("Erro ao carregar configurações.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await dbSettings.save(settings, tenantId);
            alert("Configurações salvas com sucesso!");
        } catch (error: any) {
            console.error("Erro ao salvar:", error);
            if (error.message?.includes('column') || error.message?.includes('facebook_pixel_id')) {
                alert("Erro: O banco de dados precisa ser atualizado. Por favor, execute o script SQL 'add_pixels_settings.sql' no painel do Supabase.");
            } else {
                alert("Erro ao salvar configurações: " + (error.message || "Erro desconhecido"));
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, field: 'coverImage' | 'logoImage' | 'backgroundImage') => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${field}-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('images')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage.from('images').getPublicUrl(filePath);

            setSettings(prev => ({ ...prev, [field]: data.publicUrl }));
            alert("Imagem enviada com sucesso!");
        } catch (error: any) {
            console.error("Erro no upload:", error);
            alert("Erro ao enviar imagem. Verifique se o bucket 'images' existe no Supabase.");
        }
    };

    if (isLoading) return <div className="p-8 text-center">Carregando...</div>;

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-full text-slate-600">
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Configurar Cardápio Online</h2>
                    <p className="text-slate-500">Personalize a aparência e informações da sua loja online.</p>
                </div>
            </div>

            {/* Link & QR Code Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-6 flex flex-col justify-between">
                    <div className="flex items-start gap-4 mb-4">
                        <div className="bg-blue-100 p-3 rounded-xl text-blue-600 shrink-0">
                            <Store size={32} />
                        </div>
                        <div>
                            <h3 className="font-bold text-xl text-blue-900 mb-1">Link do seu Cardápio Digital</h3>
                            <p className="text-sm text-blue-700 leading-relaxed">
                                Este é o endereço da sua loja online. Compartilhe no Instagram, WhatsApp e redes sociais.
                                Seus clientes poderão fazer pedidos diretamente por este link.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-blue-800 uppercase tracking-wider">URL do Cardápio</label>
                        <div className="flex gap-2">
                            <input
                                readOnly
                                value={`${window.location.origin}${window.location.pathname}?menu=true&tenantId=${tenantId}`}
                                className="flex-1 px-4 py-3 border border-blue-200 rounded-lg bg-white text-slate-600 text-sm font-mono shadow-sm"
                            />
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?menu=true&tenantId=${tenantId}`);
                                    alert("Link copiado para a área de transferência!");
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold transition-colors shadow-sm flex items-center gap-2"
                            >
                                <Store size={18} /> Copiar
                            </button>
                        </div>
                    </div>
                </div>

                {/* QR Code */}
                <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col items-center text-center shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-2">QR Code da Loja</h3>
                    <p className="text-xs text-slate-500 mb-4">Escaneie para testar ou imprima para seus clientes.</p>

                    <div className="bg-white p-2 rounded-lg border border-slate-100 shadow-inner mb-4">
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?menu=true&tenantId=${tenantId}`)}`}
                            alt="QR Code do Cardápio"
                            className="w-32 h-32 object-contain"
                        />
                    </div>

                    <a
                        href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(`${window.location.origin}${window.location.pathname}?menu=true&tenantId=${tenantId}`)}`}
                        download="qrcode-loja.png"
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 text-sm font-bold hover:underline flex items-center gap-1"
                    >
                        <Upload size={14} className="rotate-180" /> Baixar em Alta Resolução
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Info */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Store size={20} className="text-blue-600" /> Informações da Loja
                    </h3>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Loja</label>
                        <input
                            type="text"
                            value={settings.storeName}
                            onChange={e => setSettings({ ...settings, storeName: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Telefone (WhatsApp)</label>
                        <div className="flex items-center gap-2">
                            <Phone size={16} className="text-slate-400" />
                            <input
                                type="text"
                                value={settings.phone}
                                onChange={e => setSettings({ ...settings, phone: e.target.value })}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="5577999999999"
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Formato: 55 + DDD + Número (apenas números)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Endereço</label>
                        <div className="flex items-center gap-2">
                            <MapPin size={16} className="text-slate-400" />
                            <input
                                type="text"
                                value={settings.address}
                                onChange={e => setSettings({ ...settings, address: e.target.value })}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Horário de Funcionamento</label>
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-slate-400" />
                            <input
                                type="text"
                                value={settings.openingHours}
                                onChange={e => setSettings({ ...settings, openingHours: e.target.value })}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="Seg-Sex: 08h às 18h"
                            />
                        </div>
                    </div>
                </div>

                {/* Appearance */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Palette size={20} className="text-purple-600" /> Aparência
                    </h3>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">URL da Imagem de Capa</label>
                        <div className="flex gap-2">
                            <Image size={16} className="text-slate-400 mt-3" />
                            <input
                                type="text"
                                value={settings.coverImage || ''}
                                onChange={e => setSettings({ ...settings, coverImage: e.target.value })}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="https://exemplo.com/capa.jpg"
                            />
                            <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-2 rounded-lg border border-slate-200 transition-colors" title="Upload">
                                <Upload size={20} className="text-slate-600" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'coverImage')} />
                            </label>
                        </div>
                        {settings.coverImage && (
                            <div className="mt-2 h-24 w-full rounded-lg bg-slate-100 overflow-hidden relative">
                                <img src={settings.coverImage} alt="Preview Capa" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400x100?text=Erro+na+Imagem')} />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Imagem de Fundo (Wallpaper)</label>
                        <p className="text-xs text-slate-500 mb-2">Recomendado: 1920x1080px (Full HD)</p>
                        <div className="flex gap-2 items-center">
                            <input
                                type="text"
                                value={settings.backgroundImage || ''}
                                onChange={e => setSettings({ ...settings, backgroundImage: e.target.value })}
                                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="URL da imagem..."
                            />
                            <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-2 rounded-lg border border-slate-200 transition-colors" title="Upload">
                                <Upload size={20} className="text-slate-600" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'backgroundImage')} />
                            </label>
                        </div>
                        {settings.backgroundImage && (
                            <div className="mt-2 h-24 w-full rounded-lg bg-slate-100 overflow-hidden relative border border-slate-200">
                                <img src={settings.backgroundImage} alt="Preview Background" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400x100?text=Erro+na+Imagem')} />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">URL do Logo</label>
                        <div className="flex gap-2">
                            <Image size={16} className="text-slate-400 mt-3" />
                            <input
                                type="text"
                                value={settings.logoImage || ''}
                                onChange={e => setSettings({ ...settings, logoImage: e.target.value })}
                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                placeholder="https://exemplo.com/logo.png"
                            />
                            <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 p-2 rounded-lg border border-slate-200 transition-colors" title="Upload">
                                <Upload size={20} className="text-slate-600" />
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'logoImage')} />
                            </label>
                        </div>
                        {settings.logoImage && (
                            <div className="mt-2 h-16 w-16 rounded-lg bg-slate-100 overflow-hidden border border-slate-200">
                                <img src={settings.logoImage} alt="Preview Logo" className="w-full h-full object-contain" onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/100?text=Erro')} />
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Cor Principal</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={settings.primaryColor}
                                onChange={e => setSettings({ ...settings, primaryColor: e.target.value })}
                                className="h-10 w-10 rounded cursor-pointer border-none"
                            />
                            <input
                                type="text"
                                value={settings.primaryColor}
                                onChange={e => setSettings({ ...settings, primaryColor: e.target.value })}
                                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg uppercase"
                            />
                        </div>
                    </div>
                </div>
            </div>


            {/* Pixels and Tracking */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 space-y-4">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                    <span className="text-xl">📊</span> Pixels e Rastreamento
                </h3>
                <p className="text-sm text-slate-500">Configure aqui seus identificadores do Meta (Facebook) e Google Ads para rastrear acessos e vendas.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Facebook Pixel ID</label>
                        <input
                            type="text"
                            value={settings.facebookPixelId || ''}
                            onChange={e => setSettings({ ...settings, facebookPixelId: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                            placeholder="Ex: 123456789012345"
                        />
                        <p className="text-xs text-slate-400 mt-1">Apenas o número do ID.</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Google Tag ID (G-XXXX / AW-XXXX)</label>
                        <input
                            type="text"
                            value={settings.googleTagId || ''}
                            onChange={e => setSettings({ ...settings, googleTagId: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-sm"
                            placeholder="Ex: AW-123456789"
                        />
                        <p className="text-xs text-slate-400 mt-1">ID do Google Analytics 4 ou Google Ads.</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2 disabled:opacity-70"
                >
                    {isSaving ? 'Salvando...' : <><Save size={20} /> Salvar Configurações</>}
                </button>
            </div>
        </div >
    );
};

export default MenuConfig;
