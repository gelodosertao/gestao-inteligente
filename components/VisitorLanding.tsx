import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Snowflake, MapPin, Phone, Instagram, ShoppingBag, Clock, ShieldCheck, Truck, Droplets } from 'lucide-react';

const VisitorLanding: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#020617] text-white font-sans overflow-x-hidden">
            {/* HERO SECTION */}
            <section className="relative h-screen flex flex-col justify-center items-center px-4 overflow-hidden">
                {/* Animated Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-orange-900/10 z-0"></div>

                {/* Background Image with Overlay */}
                <div className="absolute inset-0 z-[-1] opacity-60">
                    <img
                        src="/ice_hero.png"
                        alt="Refresco no Sertão"
                        className="w-full h-full object-cover scale-110 blur-[2px] animate-pulse-slow"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/40 to-transparent"></div>
                </div>

                {/* Content */}
                <div className="relative z-10 text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    <div className="flex justify-center mb-6">
                        <div className="bg-white/10 backdrop-blur-md p-6 md:p-8 rounded-[40px] border border-white/20 shadow-2xl">
                            <img src="/logo.png" alt="Gelo do Sertão" className="h-48 md:h-72 w-auto object-contain drop-shadow-[0_0_30px_rgba(59,130,246,0.6)]" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h1 className="text-4xl md:text-7xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-white to-orange-400">
                            O Gelo que refresca o Sertão
                        </h1>
                        <p className="text-blue-200/80 text-lg md:text-xl font-medium max-w-2xl mx-auto leading-relaxed">
                            Produção com tecnologia de ponta. Distribuindo pureza e frescor para toda a região de Barreiras e Ibotirama.
                        </p>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 justify-center items-center pt-8">
                        <button
                            onClick={() => navigate('/cardapio-adega')}
                            className="group relative px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-lg transition-all duration-300 shadow-lg shadow-orange-900/40 hover:scale-105 flex items-center gap-3 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                            <ShoppingBag className="group-hover:rotate-12 transition-transform" />
                            Ver Cardápio Digital
                        </button>
                        <a
                            href="https://wa.me/5577998129383"
                            target="_blank"
                            rel="noreferrer"
                            className="px-8 py-4 bg-white/5 hover:bg-white/10 backdrop-blur-md border border-white/10 text-white rounded-2xl font-bold text-lg transition-all duration-300 flex items-center gap-3"
                        >
                            <Phone size={20} className="text-green-400" />
                            Falar com Vendas
                        </a>
                    </div>
                </div>

                {/* Scroll Indicator */}
                <div className="absolute bottom-10 animate-bounce text-blue-400/50">
                    <Clock size={32} />
                </div>
            </section>

            {/* FEATURES SECTION */}
            <section className="py-24 px-4 bg-[#020617] relative">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[32px] border border-white/20 hover:border-blue-500/50 transition-all duration-500 group relative overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.4)]">
                            <div className="bg-gradient-to-br from-blue-400/30 to-blue-600/10 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-[0_10px_20px_rgba(59,130,246,0.3)] group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 relative">
                                <Droplets className="text-blue-200 drop-shadow-[0_2px_10px_rgba(255,255,255,0.5)]" size={40} />
                                <div className="absolute inset-0 bg-white/10 rounded-2xl -z-1 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                            <h3 className="text-2xl font-bold mb-4">Qualidade Diamante</h3>
                            <p className="text-slate-400 leading-relaxed font-medium">Água 100% filtrada e purificada. Nosso gelo é cristalino e não altera o sabor da sua bebida.</p>
                        </div>

                        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[32px] border border-white/20 hover:border-orange-500/50 transition-all duration-500 group relative overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.4)]">
                            <div className="bg-gradient-to-br from-orange-400/30 to-orange-600/10 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-[0_10px_20px_rgba(249,115,22,0.3)] group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500 relative">
                                <Truck className="text-orange-200 drop-shadow-[0_2px_10px_rgba(255,255,255,0.5)]" size={40} />
                                <div className="absolute inset-0 bg-white/10 rounded-2xl -z-1 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                            <h3 className="text-2xl font-bold mb-4">Logística Ágil</h3>
                            <p className="text-slate-400 leading-relaxed font-medium">Frota própria refrigerada para garantir que o gelo chegue em perfeitas condições até você.</p>
                        </div>

                        <div className="bg-white/10 backdrop-blur-xl p-8 rounded-[32px] border border-white/20 hover:border-green-500/50 transition-all duration-500 group relative overflow-hidden shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_20px_40px_rgba(0,0,0,0.4)]">
                            <div className="bg-gradient-to-br from-green-400/30 to-green-600/10 w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-[0_10px_20px_rgba(34,197,94,0.3)] group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500 relative">
                                <ShieldCheck className="text-green-200 drop-shadow-[0_2px_10px_rgba(255,255,255,0.5)]" size={40} />
                                <div className="absolute inset-0 bg-white/10 rounded-2xl -z-1 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                            <h3 className="text-2xl font-bold mb-4">Segurança Alimentar</h3>
                            <p className="text-slate-400 leading-relaxed font-medium">Processos rigorosos de higienização seguindo todas as normas da vigilância sanitária.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* PRODUCTS PREVIEW */}
            <section className="py-24 bg-gradient-to-b from-[#020617] to-[#0f172a]">
                <div className="max-w-7xl mx-auto px-4">
                    <div className="text-center mb-16 space-y-4">
                        <h2 className="text-3xl md:text-5xl font-bold">Nossa Produção</h2>
                        <p className="text-blue-300 text-lg">Formatos pensados para cada necessidade.</p>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                        {[
                            { name: 'Gelo em Cubos', desc: 'Ideal para drinks e copos', icon: Snowflake, color: 'blue' },
                            { name: 'Gelo em Escama', desc: 'Conservação de alimentos', icon: Droplets, color: 'cyan' },
                            { name: 'Gelo em Barra', desc: 'Alta durabilidade', icon: ShieldCheck, color: 'indigo' },
                            { name: 'Adega Completa', desc: 'As melhores marcas', icon: ShoppingBag, color: 'orange' },
                        ].map((prod, i) => (
                            <div key={i} className="group cursor-default">
                                <div className="bg-gradient-to-br from-white/15 to-white/5 p-8 rounded-[40px] border border-white/10 group-hover:border-blue-500/30 transition-all duration-500 text-center space-y-4 shadow-[0_10px_30px_rgba(0,0,0,0.3)] relative">
                                    <div className="flex justify-center">
                                        <div className="bg-white/10 p-5 rounded-3xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_10px_20px_rgba(0,0,0,0.2)] group-hover:scale-125 transition-transform duration-500">
                                            <prod.icon className="text-blue-300 drop-shadow-[0_2px_5px_rgba(59,130,246,0.5)]" size={44} strokeWidth={1.5} />
                                        </div>
                                    </div>
                                    <h4 className="font-black text-lg tracking-tight">{prod.name}</h4>
                                    <p className="text-slate-500 text-sm font-medium">{prod.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* FOOTER / CONTACT */}
            <footer className="py-20 px-4 border-t border-white/5 bg-[#0f172a]">
                <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
                    <div className="space-y-6">
                        <img src="/logo.png" alt="Gelo do Sertão" className="h-20 w-auto brightness-90 hover:brightness-110 transition-all" />
                        <p className="text-slate-400 text-sm leading-relaxed">
                            Somos referência no gelo de sabor e líderes regionais em produção e distribuição de gelo cristalino.
                        </p>
                        <div className="flex gap-4">
                            <a href="#" className="p-2 bg-white/5 rounded-full text-slate-400 hover:text-white hover:bg-orange-500 transition-all">
                                <Instagram size={20} />
                            </a>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h4 className="font-bold text-lg text-blue-400">Localização</h4>
                        <div className="space-y-4">
                            <div className="space-y-4">
                                <div className="flex gap-3 text-slate-400 items-start">
                                    <MapPin className="shrink-0 text-orange-500" size={18} />
                                    <span className="text-sm font-bold tracking-tight">Barreiras - BA</span>
                                </div>
                                <div className="flex gap-3 text-slate-400 items-start">
                                    <MapPin className="shrink-0 text-orange-500" size={18} />
                                    <span className="text-sm font-bold tracking-tight">Ibotirama - BA</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h4 className="font-bold text-lg text-blue-400">Atendimento</h4>
                        <div className="space-y-4">
                            <div className="flex gap-3 text-slate-400 items-center">
                                <Clock className="text-blue-500" size={18} />
                                <span className="text-sm">Seg a Sáb: 08h às 22h</span>
                            </div>
                            <div className="flex gap-3 text-slate-400 items-center">
                                <Clock className="text-blue-500" size={18} />
                                <span className="text-sm">Dom: 08h às 14h</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h4 className="font-bold text-lg text-blue-400">Contato Directo</h4>
                        <a
                            href="tel:5577998129383"
                            className="block p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-orange-500/10 hover:border-orange-500/30 transition-all"
                        >
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">WhatsApp</p>
                            <p className="text-lg font-mono font-bold">(77) 99812-9383</p>
                        </a>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/5 text-center text-slate-600 text-xs">
                    © {new Date().getFullYear()} Gelo do Sertão. Todos os direitos reservados.
                </div>
            </footer>

            {/* Tailwind specific glass/animation utilities not in global CSS */}
            <style>{`
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1.1); }
          50% { transform: scale(1.15); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 15s infinite ease-in-out;
        }
      `}</style>
        </div>
    );
};

export default VisitorLanding;
