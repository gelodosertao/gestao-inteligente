export const FISCAL_NOT_CONFIGURED = 'Integração fiscal não configurada';

export interface FiscalIntegrationStatus {
    readonly configured: boolean;
    readonly message: string;
}

// This is an application boundary, not the external API's transport contract.
export interface FiscalIntegration {
    getStatus(): FiscalIntegrationStatus;
    requireConfigured(): void;
}

export class FiscalIntegrationNotConfiguredError extends Error {
    readonly code = 'FISCAL_NOT_CONFIGURED';

    constructor() {
        super(FISCAL_NOT_CONFIGURED);
        this.name = 'FiscalIntegrationNotConfiguredError';
    }
}

export const fiscalIntegration: FiscalIntegration = {
    getStatus: () => ({ configured: false, message: FISCAL_NOT_CONFIGURED }),
    requireConfigured: () => { throw new FiscalIntegrationNotConfiguredError(); },
};
