import { z } from 'zod';

export const EnderecoSchema = z.object({
  xLgr: z.string().min(1).max(60).default('RUA NAO INFORMADA'),
  nro: z.string().max(60).default('S/N'),
  xBairro: z.string().max(60).default('CENTRO'),
  cMun: z.string().length(7).default('2927408'),
  xMun: z.string().max(60).default('IBOTIRAMA'),
  UF: z.string().length(2).default('BA'),
  CEP: z.string().regex(/^\d{8}$/).default('47520000'),
  cPais: z.string().default('1058'),
  xPais: z.string().default('BRASIL'),
  fone: z.string().max(14).default(''),
});

export type Endereco = z.infer<typeof EnderecoSchema>;

export const IdeSchema = z.object({
  cUF: z.string().default('29'),
  natOp: z.string().min(1).default('Venda de mercadoria'),
  mod: z.string().default('55'),
  serie: z.string().min(1).max(3),
  nNF: z.string().min(1).max(9),
  dhEmi: z.string().min(1),
  tpNF: z.enum(['0', '1']).default('1'),
  idDest: z.enum(['1', '2', '3']).default('1'),
  cMunFG: z.string().length(7).default('2927408'),
  tpImp: z.enum(['1', '2', '3', '4']).default('1'),
  tpEmis: z.enum(['1', '2', '3', '4', '5', '6', '7', '8', '9']).default('1'),
  tpAmb: z.union([z.literal(1), z.literal(2)]),
  finNFe: z.enum(['1', '2', '3']).default('1'),
  indFinal: z.enum(['0', '1']),
  indPres: z.enum(['0', '1', '2', '3', '4', '5', '9']).default('1'),
  procEmi: z.enum(['0', '1', '2', '3']).default('0'),
  verProc: z.string().min(1).max(20),
  cMunFGIBS: z.string().length(7).default('2927408'),
});

export type Ide = z.infer<typeof IdeSchema>;

export const ProdSchema = z.object({
  cProd: z.string().min(1).max(60),
  cEAN: z.string().default('SEM GTIN'),
  xProd: z.string().min(1).max(120),
  NCM: z.string().length(8).default('22019000'),
  CFOP: z.string().length(4).default('5101'),
  uCom: z.string().max(6).default('UN'),
  qCom: z.number().positive(),
  vUnCom: z.number().nonnegative(),
  vProd: z.number().nonnegative(),
  cEANTrib: z.string().default('SEM GTIN'),
  uTrib: z.string().max(6).default('UN'),
  qTrib: z.number().positive(),
  vUnTrib: z.number().nonnegative(),
  indTot: z.enum(['0', '1']).default('1'),
});

export type Prod = z.infer<typeof ProdSchema>;

export const ImpostoSchema = z.object({
  ICMS: z.object({
    ICMSSN102: z.object({
      orig: z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8']).default('0'),
      CSOSN: z.string(),
    }),
  }),
  PIS: z.object({
    PISNT: z.object({ CST: z.string() }).default({ CST: '07' }),
  }),
  COFINS: z.object({
    COFINSNT: z.object({ CST: z.string() }).default({ CST: '07' }),
  }),
});

export type Imposto = z.infer<typeof ImpostoSchema>;

export const DetSchema = z.object({
  prod: ProdSchema,
  imposto: ImpostoSchema,
});

export type Det = z.infer<typeof DetSchema>;

export const EmitSchema = z.object({
  CNPJCPF: z.string().regex(/^\d{14}$/),
  xNome: z.string().min(1).max(60),
  xFant: z.string().min(1).max(60).optional(),
  enderEmit: EnderecoSchema,
  IE: z.string().regex(/^\d{2,14}$/).optional(),
  IEST: z.string().optional(),
  CRT: z.enum(['1', '2', '3']).default('1'),
});

export type Emit = z.infer<typeof EmitSchema>;

export const DestSchema = z.object({
  CNPJCPF: z.string().regex(/^\d{11}$|^\d{14}$/).optional(),
  xNome: z.string().min(1).max(60),
  enderDest: EnderecoSchema.optional(),
  indIEDest: z.enum(['1', '2', '9']).default('9'),
  IE: z.string().optional(),
  ISUF: z.string().optional(),
});

export type Dest = z.infer<typeof DestSchema>;

export const ICMSTotSchema = z.object({
  vBC: z.string().default('0.00'),
  vICMS: z.string().default('0.00'),
  vICMSDeson: z.string().default('0.00'),
  vFCP: z.string().default('0.00'),
  vBCST: z.string().default('0.00'),
  vST: z.string().default('0.00'),
  vFCPST: z.string().default('0.00'),
  vFCPSTRet: z.string().default('0.00'),
  vProd: z.string(),
  vFrete: z.string().default('0.00'),
  vSeg: z.string().default('0.00'),
  vDesc: z.string().default('0.00'),
  vII: z.string().default('0.00'),
  vIPI: z.string().default('0.00'),
  vIPIDevol: z.string().default('0.00'),
  vPIS: z.string().default('0.00'),
  vCOFINS: z.string().default('0.00'),
  vOutro: z.string().default('0.00'),
  vNF: z.string(),
});

export type ICMSTot = z.infer<typeof ICMSTotSchema>;

export const IBSCBSTotSchema = z.object({
  vBCIBSCBS: z.string().default('0.00'),
  gIBS: z.object({
    vIBS: z.string().default('0.00'),
    vCredPres: z.string().default('0.00'),
    vCredPresCondSus: z.string().default('0.00'),
  }).optional(),
  gCBS: z.object({
    vCBS: z.string().default('0.00'),
    vCredPres: z.string().default('0.00'),
    vCredPresCondSus: z.string().default('0.00'),
  }).optional(),
});

export type IBSCBSTot = z.infer<typeof IBSCBSTotSchema>;

export const InfNFeSchema = z.object({
  ide: IdeSchema,
  emit: EmitSchema,
  dest: DestSchema,
  det: z.array(DetSchema).min(1).max(990),
  total: z.object({
    ICMSTot: ICMSTotSchema,
    IBSCBSTot: IBSCBSTotSchema.optional(),
  }),
  transp: z.object({ modFrete: z.enum(['0', '1', '2', '3', '4', '5', '9']).default('9') }),
  pag: z.object({
    detPag: z.union([
      z.object({
        tPag: z.string().default('01'),
        vPag: z.string(),
      }),
      z.array(z.object({
        tPag: z.string().default('01'),
        vPag: z.string(),
      })),
    ]),
  }),
});

export type InfNFe = z.infer<typeof InfNFeSchema>;

export const NFeEnvelopeSchema = z.object({
  idLote: z.number().int().positive(),
  indSinc: z.literal(1),
  NFe: z.object({
    infNFe: InfNFeSchema,
  }),
});

export type NFeEnvelope = z.infer<typeof NFeEnvelopeSchema>;
