import { GoogleGenAI } from "@google/genai";
import { Product, Sale, FinancialRecord } from '../types';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

export const getBusinessAnalysis = async (
  products: Product[],
  sales: Sale[],
  financials: FinancialRecord[],
  userQuery: string
): Promise<string> => {

  // Construct a context string representing the current business state
  const inventorySummary = products.map(p =>
    `${p.name}: Matriz(${p.stockMatriz}), Filial(${p.stockFilial}), PreçoVarejo(R$${p.priceFilial}), PreçoAtacado(R$${p.priceMatriz})`
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
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "Não consegui gerar uma análise no momento.";
  } catch (error) {
    console.error("Erro ao consultar Gemini:", error);
    return "Desculpe, ocorreu um erro ao conectar com a inteligência artificial. Verifique sua chave de API.";
  }
};