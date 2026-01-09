// Interface para comunicação com o Hardware (Android/SmartPOS)
// Este arquivo serve como uma "Ponte" entre o site e o aplicativo nativo.

export const hardwareBridge = {
    /**
     * Verifica se o sistema está rodando dentro do App Android (SmartPOS)
     */
    isNative: (): boolean => {
        // @ts-ignore
        return typeof window.Android !== 'undefined' || typeof window.CieloLIO !== 'undefined';
    },

    /**
     * Envia um comando de impressão para o Hardware
     * @param content Conteúdo do cupom (Texto simples ou Base64 da imagem)
     */
    printReceipt: (content: string): boolean => {
        console.log("Tentando imprimir via Hardware...");

        // 1. Tenta interface genérica Android (Nossa implementação futura)
        // @ts-ignore
        if (typeof window.Android !== 'undefined' && window.Android.print) {
            // @ts-ignore
            window.Android.print(content);
            return true;
        }

        // 2. Tenta interface Cielo LIO (Exemplo SDK V2)
        // @ts-ignore
        if (typeof window.CieloLIO !== 'undefined') {
            // @ts-ignore
            window.CieloLIO.print(content);
            return true;
        }

        // Se não encontrou hardware, retorna false para usar o fallback (Download)
        console.log("Hardware não detectado. Usando modo Web.");
        return false;
    },

    /**
     * Inicia um pagamento no cartão (Crédito/Débito)
     */
    startPayment: (amount: number, type: 'CREDIT' | 'DEBIT', installments: number = 1): Promise<any> => {
        return new Promise((resolve, reject) => {
            if (!hardwareBridge.isNative()) {
                reject("Hardware não detectado");
                return;
            }

            // Simulação da chamada nativa
            // @ts-ignore
            if (window.Android && window.Android.pay) {
                // @ts-ignore
                window.Android.pay(amount, type, installments);

                // Aqui precisaríamos de um listener para saber quando acabou
                // Por enquanto é apenas a estrutura
            }
        });
    }
};
