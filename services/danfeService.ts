import jsPDF from 'jspdf';
import { Sale } from '../types';
import { invoiceService } from './invoiceService';

const SEFAZ_URL = 'https://www.sefaz.ba.gov.br/servicos/consulta/consultaNota.asp?chave=';

type JsPdf = jsPDF & {
  lastAutoTable?: { finalY: number };
};

function formatChave(chave: string): string {
  if (!chave) return '';
  return chave.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',');
}

function renderBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  opts?: { label?: string; fill?: string; border?: number; labelBg?: string },
) {
  doc.setDrawColor(0);
  doc.setLineWidth(opts?.border ?? 0.3);
  doc.rect(x, y, w, h);
  if (opts?.fill) {
    doc.setFillColor(opts.fill);
    doc.rect(x, y, w, h, 'F');
  }
  if (opts?.label) {
    const labelH = 4.5;
    if (opts.labelBg) {
      doc.setFillColor(opts.labelBg);
      doc.rect(x, y, doc.getTextWidth(opts.label) + 4, labelH, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.5);
    doc.setTextColor(80);
    doc.text(opts.label, x + 1.5, y + 3.2);
  }
}

function renderLabelValue(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  value: string,
  opts?: { valueSize?: number; valueBold?: boolean; maxWidth?: number; color?: string | number },
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  doc.setTextColor(100);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont('helvetica', opts?.valueBold ? 'bold' : 'normal');
  doc.setFontSize(opts?.valueSize ?? 7.5);
  if (opts?.color !== undefined) {
    doc.setTextColor(opts.color as any);
  } else {
    doc.setTextColor(0);
  }
  const v = value || '-';
  if (opts?.maxWidth && doc.getTextWidth(v) > opts.maxWidth) {
    doc.text(doc.splitTextToSize(v, opts.maxWidth).slice(0, 2) as string[], x, y + 3.2);
  } else {
    doc.text(v, x, y + 3.2);
  }
}

function renderBoxLabelValue(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  opts?: { valueSize?: number; valueBold?: boolean; fill?: string },
) {
  renderBox(doc, x, y, w, h, { label, fill: opts?.fill });
  renderLabelValue(doc, x + 2, y + 2.5, '', value, { valueSize: opts?.valueSize ?? 7.5, valueBold: opts?.valueBold });
}

export async function generateDanfe(sale: Sale): Promise<void> {
  const saleId = sale.id;

  try {
    const result = await invoiceService.getDanfe(saleId);
    if (result.success && result.base64) {
      const binaryStr = atob(result.base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `danfe-${saleId.substring(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    console.warn('[danfeService] Servidor não retornou DANFE, usando fallback client-side');
  } catch (err) {
    console.warn('[danfeService] Erro ao buscar DANFE do servidor, usando fallback client-side:', err);
  }

  await generateDanfeClientSide(sale);
}

async function generateDanfeClientSide(sale: Sale): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }) as JsPdf;
  const pw = 210;
  const ml = 8;
  const mr = 8;
  const cw = pw - ml - mr;
  const det = sale.customerDetails;

  let logoData: string | undefined;
  try {
    const resp = await fetch('/logo.png');
    const blob = await resp.blob();
    logoData = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    // Segue sem logo
  }

  let y = ml;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(ml, y, cw, 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text('RECEBEMOS', ml + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(60);
  doc.text(`Data: ____/____/________`, ml + 4, y + 11);
  doc.text('Assinatura: __________________________________', ml + 4, y + 16);

  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text(`Cliente: ${sale.customerName}`, ml + 4, y + 23);

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(ml + cw * 0.45, y, ml + cw * 0.45, y + 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(0);
  doc.text('NOTA FISCAL ELETRÔNICA', ml + cw * 0.45 + 4, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(60);
  doc.text(`NF-e Nº ${sale.nfeNumber || '-'} / Série ${sale.nfeSeries || '-'}`, ml + cw * 0.45 + 4, y + 11);
  doc.text(
    `Data Emissão: ${sale.nfeIssuedAt ? new Date(sale.nfeIssuedAt).toLocaleDateString('pt-BR') : '-'}`,
    ml + cw * 0.45 + 4,
    y + 16,
  );
  if (sale.nfeNumber) {
    doc.text(`Protocolo: ${sale.nfeNumber}`, ml + cw * 0.45 + 4, y + 21);
  }

  y += 28;

  const emitH = 28;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(ml, y, cw, emitH);

  if (logoData) {
    doc.addImage(logoData, 'PNG', ml + 3, y + 2, 22, 22);
  }

  const eX = ml + (logoData ? 27 : 4);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text('GELO DO SERTÃO', eX, y + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(60);
  doc.text('CNPJ: 47.026.674/0001-29', eX, y + 13.5);
  doc.text('IE: 117.178.795', eX, y + 17);
  doc.text('Rua Exemplo, 100 - Centro, Ibotirama - BA, CEP: 47.500-000', eX, y + 20.5);
  doc.text('Fone: (77) 9 9999-9999', eX, y + 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text('DANFE', ml + cw - 2, y + 9, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100);
  doc.text('DOCUMENTO AUXILIAR DA', ml + cw - 2, y + 14, { align: 'right' });
  doc.text('NOTA FISCAL ELETRÔNICA', ml + cw - 2, y + 18, { align: 'right' });

  y += emitH;

  const chaveH = 14;
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(ml, y, cw, chaveH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(80);
  doc.text('CHAVE DE ACESSO', ml + 2, y + 3.5);

  if (sale.invoiceKey) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0);
    const chaveFmt = formatChave(sale.invoiceKey);
    doc.text(chaveFmt, ml + 2, y + 10);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text('Chave de acesso não informada', ml + 2, y + 10);
  }

  y += chaveH;

  const destH = 36;
  const d1 = ml;
  const d2 = ml + cw * 0.3;
  const d3 = ml + cw * 0.55;
  const d4 = ml + cw * 0.65;

  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(ml, y, cw, destH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(80);
  doc.text('DESTINATÁRIO / REMETENTE', ml + 2, y + 3);

  doc.setDrawColor(200);
  doc.setLineWidth(0.2);
  doc.line(ml, y + 4.5, ml + cw, y + 4.5);
  doc.line(ml + cw * 0.3, y + 4.5, ml + cw * 0.3, y + destH);
  doc.line(ml, y + 10, ml + cw * 0.3, y + 10);
  doc.line(ml + cw * 0.55, y + 4.5, ml + cw * 0.55, y + 10);
  doc.line(ml + cw * 0.65, y + 4.5, ml + cw * 0.65, y + 10);

  doc.line(ml, y + 16, ml + cw, y + 16);
  doc.line(ml + cw * 0.4, y + 16, ml + cw * 0.4, y + 22);
  doc.line(ml + cw * 0.6, y + 16, ml + cw * 0.6, y + 22);
  doc.line(ml + cw * 0.8, y + 16, ml + cw * 0.8, y + 22);

  doc.line(ml, y + 22, ml + cw, y + 22);
  doc.line(ml + cw * 0.35, y + 22, ml + cw * 0.35, y + 28);
  doc.line(ml + cw * 0.6, y + 22, ml + cw * 0.6, y + 28);
  doc.line(ml + cw * 0.75, y + 22, ml + cw * 0.75, y + 28);

  doc.line(ml, y + 28, ml + cw, y + 28);

  renderLabelValue(doc, ml + 2, y + 5.5, 'NOME / RAZÃO SOCIAL', det?.razaoSocial || sale.customerName);
  renderLabelValue(doc, d2 + 2, y + 5.5, 'CPF / CNPJ', '-', { valueBold: true });

  renderLabelValue(
    doc,
    ml + 2,
    y + 11,
    'DATA DE EMISSÃO',
    sale.nfeIssuedAt ? new Date(sale.nfeIssuedAt).toLocaleDateString('pt-BR') : '-',
  );
  renderLabelValue(doc, d2 + 2, y + 11, 'DATA DA SAÍDA', '-');
  renderLabelValue(doc, d3 + 2, y + 11, 'INSCRIÇÃO ESTADUAL', det?.inscricaoEstadual || '-');
  renderLabelValue(doc, d4 + 2, y + 11, 'UF', det?.state || 'BA');

  renderLabelValue(
    doc,
    ml + 2,
    y + 17,
    'ENDEREÇO',
    [det?.logradouro, det?.numero].filter(Boolean).join(', ') || sale.deliveryAddress || '-',
    { maxWidth: cw * 0.38 - 4 },
  );
  renderLabelValue(doc, d2 + 2, y + 17, 'BAIRRO', det?.bairro || '-');
  renderLabelValue(doc, d3 + 2, y + 17, 'CEP', det?.zipCode || '-');
  renderLabelValue(doc, d4 + 2, y + 17, 'CIDADE', det?.city || sale.deliveryCity || '-');

  renderLabelValue(doc, ml + 2, y + 23, 'MUNICÍPIO', det?.city || sale.deliveryCity || '-');
  renderLabelValue(doc, d2 + 2, y + 23, 'TELEFONE', det?.phone || '-');
  renderLabelValue(doc, d3 + 2, y + 23, 'IE', '-');

  renderLabelValue(doc, ml + 2, y + 29, 'DADOS ADICIONAIS', '');

  y += destH;

  const colW = [14, 68, 18, 16, 14, 10, 24, 28];

  const tableX = ml;
  const headerH = 8;

  doc.setFillColor(30, 30, 30);
  doc.rect(tableX, y, cw, headerH, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(255);

  let colX = tableX + 1;
  const headers = ['CÓDIGO', 'DESCRIÇÃO', 'NCM', 'CFOP', 'QTD', 'UN', 'VL UNIT', 'VL TOTAL'];
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], colX, y + 5);
    colX += colW[i];
  }

  y += headerH;

  const items = sale.items || [];
  const rowH = 6;
  let rowCount = 0;
  const maxRows = 32;

  items.forEach((item, idx) => {
    if (rowCount >= maxRows) return;

    if (idx % 2 === 1) {
      doc.setFillColor(245, 247, 250);
      doc.rect(tableX, y, cw, rowH, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(0);

    colX = tableX + 1;

    doc.text(item.productId?.substring(0, 8) || '-', colX, y + 4);
    colX += colW[0];
    const desc = item.productName.length > 30 ? item.productName.substring(0, 28) + '..' : item.productName;
    doc.text(desc, colX, y + 4);
    colX += colW[1];
    doc.text(item.ncm || '-', colX, y + 4);
    colX += colW[2];
    doc.text(item.cfop || '-', colX, y + 4);
    colX += colW[3];
    doc.text(String(item.quantity), colX, y + 4);
    colX += colW[4];
    const unidade = 'UN';
    doc.text(unidade, colX, y + 4);
    colX += colW[5];
    doc.text(`R$ ${fmt(item.priceAtSale)}`, colX, y + 4);
    colX += colW[6];
    doc.setFont('helvetica', 'bold');
    doc.text(`R$ ${fmt(item.quantity * item.priceAtSale)}`, colX, y + 4);

    y += rowH;
    rowCount++;
  });

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(tableX, y, tableX + cw, y);
  y += 2;

  const totalH = 14;
  doc.setFillColor(240, 248, 240);
  doc.rect(tableX, y, cw, totalH, 'F');
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(tableX, y, cw, totalH);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 80, 30);
  doc.text(`TOTAL: R$ ${fmt(sale.total)}`, tableX + cw - 8, y + 8, { align: 'right' });

  y += totalH;

  if (sale.discount && sale.discount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(60);
    doc.text(`Base de Cálculo ICMS: R$ ${fmt(sale.total + sale.discount)}`, tableX + 2, y + 3);
    doc.text(`Desconto: R$ ${fmt(sale.discount)}`, tableX + 2, y + 8);
    y += 12;
  } else {
    doc.text(`Base de Cálculo ICMS: R$ ${fmt(sale.total)}`, tableX + 2, y + 3);
    y += 8;
  }

  const footerTop = Math.max(y + 10, 250);

  if (sale.invoiceKey) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(ml + cw - 36, footerTop, 32, 32);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5);
    doc.setTextColor(100);
    doc.text('QR CODE', ml + cw - 20, footerTop + 2.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(140);
    doc.text('Consulte pela', ml + cw - 20, footerTop + 12, { align: 'center' });
    doc.text('chave de acesso', ml + cw - 20, footerTop + 15, { align: 'center' });
    doc.text('em sefaz.ba.gov.br', ml + cw - 20, footerTop + 18, { align: 'center' });

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(0);
    doc.text(formatChave(sale.invoiceKey), ml + 2, footerTop + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5);
    doc.setTextColor(100);
    doc.textWithLink('Consulte pela chave de acesso em sefaz.ba.gov.br', ml + 2, footerTop + 10, {
      url: SEFAZ_URL + sale.invoiceKey,
    });
  }

  if (sale.nfeNumber) {
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(ml, footerTop + (sale.invoiceKey ? 35 : 0), cw, 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(80);
    doc.text('PROTOCOLO DE AUTORIZAÇÃO', ml + 2, footerTop + (sale.invoiceKey ? 38 : 3));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text(sale.nfeNumber, ml + 2, footerTop + (sale.invoiceKey ? 42 : 7));
  }

  const footerY = 289;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setTextColor(140);
  doc.text('Sistema Gelo do Sertão — Gestão Inteligente', ml, footerY);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, ml + cw, footerY, { align: 'right' });

  doc.save(`danfe-${sale.id.substring(0, 8)}.pdf`);
}