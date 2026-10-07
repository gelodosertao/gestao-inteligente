import fs from 'node:fs/promises';

export async function readCompletePdf(filePath: string, timeoutMs = 10000): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const pdf = await fs.readFile(filePath);
      if (pdf.subarray(0, 5).toString('latin1') === '%PDF-' &&
          pdf.subarray(-128).toString('latin1').includes('%%EOF')) return pdf;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  } while (Date.now() < deadline);
  throw new Error('O PDF do DANFE não terminou de ser gravado no tempo esperado.');
}
