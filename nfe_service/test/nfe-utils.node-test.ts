import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatNfeAaMm, montarChaveAcesso, retryWithBackoff } from '../src/utils/nfe-utils';

const issueParams = {
  cUF: '29',
  aaMm: '2609',
  cnpj: '47026674000129',
  mod: '55',
  serie: '1',
  nNF: '42',
  tpEmis: '1',
  cNF: '12345678',
};

test('a chave fiscal preserva o CNPJ do emitente e tem 44 dígitos', () => {
  const key = montarChaveAcesso(issueParams);

  assert.match(key, /^\d{44}$/);
  assert.equal(key.slice(6, 20), issueParams.cnpj);
  assert.notEqual(key, montarChaveAcesso({ ...issueParams, cnpj: '12345678000190' }));
});

test('o período fiscal é formatado como AAMM', () => {
  assert.equal(formatNfeAaMm(new Date(2026, 8, 22)), '2609');
});

test('uma falha transitória pode ser repetida sem alterar o resultado', async () => {
  let attempts = 0;
  const result = await retryWithBackoff(async () => {
    attempts++;
    if (attempts === 1) throw new Error('network timeout');
    return 'ok';
  }, { maxRetries: 1, baseDelayMs: 0 });

  assert.equal(result, 'ok');
  assert.equal(attempts, 2);
});

test('uma falha permanente não é repetida', async () => {
  let attempts = 0;

  await assert.rejects(retryWithBackoff(async () => {
    attempts++;
    throw new Error('invalid document');
  }, { maxRetries: 2, baseDelayMs: 0 }), /invalid document/);
  assert.equal(attempts, 1);
});
