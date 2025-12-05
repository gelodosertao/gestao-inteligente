import React, { useState } from 'react';
import { Sparkles, Send, Bot, Loader2, ArrowLeft } from 'lucide-react';
import { getBusinessAnalysis } from '../services/geminiService';
import { Product, Sale, FinancialRecord } from '../types';
import ReactMarkdown from 'react-markdown';

interface AIAssistantProps {
  products: Product[];
  sales: Sale[];
  financials: FinancialRecord[];
  onBack: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ products, sales, financials, onBack }) => {
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResponse(null);

    const result = await getBusinessAnalysis(products, sales, financials, query);

    setResponse(result);
    setLoading(false);
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col animate-in fade-in zoom-in-95 duration-300">
      <div className="flex-none mb-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <ArrowLeft size={24} className="text-slate-600" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="text-orange-500" /> Consultor IA
            </h2>
            <p className="text-slate-500">
              Pergunte sobre estratégias de vendas, redução de custos ou análise de estoque.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">

        {/* Chat Area */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50">
          {!response && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
              <Bot size={64} className="mb-4 text-blue-300" />
              <p>Faça uma pergunta sobre sua empresa.</p>
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm max-w-lg w-full">
                <button onClick={() => setQuery("Como posso aumentar minhas vendas de Gelo em Cubo?")} className="p-3 border border-slate-200 rounded-lg hover:bg-white hover:shadow-sm text-left transition-all hover:border-orange-300">
                  "Como aumentar vendas de Gelo Cubo?"
                </button>
                <button onClick={() => setQuery("Faça um resumo financeiro desta semana.")} className="p-3 border border-slate-200 rounded-lg hover:bg-white hover:shadow-sm text-left transition-all hover:border-orange-300">
                  "Resumo financeiro da semana"
                </button>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 size={40} className="animate-spin text-orange-500 mx-auto mb-4" />
                <p className="text-slate-500 animate-pulse">Analisando dados da Matriz e Filial...</p>
              </div>
            </div>
          )}

          {response && (
            <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-3 mb-4 border-b border-slate-100 pb-3">
                <div className="bg-orange-100 p-2 rounded-lg">
                  <Sparkles size={20} className="text-orange-600" />
                </div>
                <h3 className="font-bold text-slate-800">Análise Gerada</h3>
              </div>
              <div className="prose prose-slate prose-sm max-w-none text-slate-700">
                <ReactMarkdown>{response}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          <div className="max-w-4xl mx-auto relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Ex: Qual produto está dando mais prejuízo?"
              className="w-full pl-6 pr-14 py-4 rounded-xl bg-slate-100 border-2 border-transparent focus:border-orange-500 focus:bg-white focus:outline-none transition-all text-slate-700"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query}
              className="absolute right-2 top-2 p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            A IA analisa dados de {products.length} produtos e {sales.length} vendas recentes.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AIAssistant;