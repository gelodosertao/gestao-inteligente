/** Initial values supplied for GDS. Saved issuer settings remain authoritative. */
export const gdsIssuerDefaults = {
  issuerCnpj: '47026674000129',
  xmlAuthorizedTaxId: '11097133000144',
  technicalResponsible: {
    cnpj: '47026674000129',
    contact: 'Suporte GDS',
    email: 'gelodosertaobahia@gmail.com',
    phone: '7798129383',
  },
} as const;

export const gdsInitialSimpleNotice =
  'DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL. NAO GERA DIREITO A CREDITO FISCAL DE ICMS, ISS E IPI.';
