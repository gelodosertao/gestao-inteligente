import { Product, Sale, FinancialRecord } from '../types';
import { supabase } from './supabase';

export const getBusinessAnalysis = async (
  products: Product[],
  sales: Sale[],
  financials: FinancialRecord[],
  userQuery: string
): Promise<string> => {

  // Construct a context string representing the current business state
  const inventorySummary = products.map(p =>
    `${p.name}: Matriz(${p.stockMatrizIbotirama + p.stockMatrizBarreiras}), Filial(${p.stockFilial}), PreçoVarejo(R$${p.priceFilial}), PreçoAtacado(R$${p.priceMatriz})`
  ).join('\n');

  const recentSales = sales.slice(0, 5).map(s =>
    `Data: ${s.date}, Total: R$${s.total}, Cliente: ${s.customerName}, Unidade: ${s.branch}`
  ).join('\n');

  const financialSummary = financials.map(f =>
    `${f.type === 'Income' ? '+' : '-'} R$${f.amount} (${f.description})`
  ).join('\n');

  const prompt = `
    Você é um assistente sênior de gestão para a empresa "Gelo do Sertão", que possui uma fábrica de gelo (Matriz) e uma adega (Filial).
    
    Dados atuais do negócio:
    
    --- ESTOQUE E PREÇOS ---
    ${inventorySummary}
    
    --- VENDAS RECENTES ---
    ${recentSales}
    
    --- FINANCEIRO RECENTE ---
    ${financialSummary}
    
    Pergunta do Usuário: "${userQuery}"
    
    Responda de forma estratégica, prática e concisa. Se for sobre finanças, sugira melhorias. Se for sobre estoque, alerte sobre baixas. Use formatação Markdown.
  `;

  try {
    const { data, error } = await supabase.functions.invoke('gemini-analysis', {
      body: { prompt }
    });

    if (error) {
      throw error;
    }

    return data?.text || "Não consegui gerar uma análise no momento.";
  } catch (error) {
    console.error("Erro ao consultar Gemini via Edge Function:", error);
    return "Desculpe, ocorreu um erro ao conectar com o serviço de IA. Verifique se a Edge Function está configurada.";
  }
};