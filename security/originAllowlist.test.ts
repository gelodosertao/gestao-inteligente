import { describe, expect, it } from 'vitest';
import { isOriginAllowed, matchesOriginPattern, normalizeOriginEntries } from '../supabase/functions/_shared/origin';

describe('isOriginAllowed', () => {
  const entries = [
    'http://localhost:5173',
    'https://gestao-inteligente-gelodosertaos-projects.vercel.app',
    'https://gestao-inteligente-*-gelodosertaos-projects.vercel.app',
  ];

  it('aceita origem exata cadastrada', () => {
    expect(isOriginAllowed('https://gestao-inteligente-gelodosertaos-projects.vercel.app', entries)).toBe(true);
  });

  it('aceita qualquer deploy preview do projeto', () => {
    expect(isOriginAllowed('https://gestao-inteligente-h4guu9oax-gelodosertaos-projects.vercel.app', entries)).toBe(true);
    expect(isOriginAllowed('https://gestao-inteligente-abc123-gelodosertaos-projects.vercel.app', entries)).toBe(true);
  });

  it('recusa origens fora do projeto', () => {
    expect(isOriginAllowed('https://outro-projeto.vercel.app', entries)).toBe(false);
    expect(isOriginAllowed('https://gestao-inteligente-abc123-gelodosertaos-projects.vercel.app.evil.com', entries)).toBe(false);
    expect(isOriginAllowed('https://gestao-inteligente--gelodosertaos-projects.vercel.app', entries)).toBe(false);
    expect(isOriginAllowed('http://gestao-inteligente-h4guu9oax-gelodosertaos-projects.vercel.app', entries)).toBe(false);
  });

  it('não trata caractere especial do domínio como curinga', () => {
    expect(matchesOriginPattern('https://a.b.com', 'https://axb.com')).toBe(false);
    expect(isOriginAllowed('http://localhost:5174', entries)).toBe(false);
  });
});

describe('normalizeOriginEntries', () => {
  it('junta variáveis, remove espaços, barras finais e vazios', () => {
    expect(normalizeOriginEntries([undefined, ' https://a.com/ , https://b.com ', ''])).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });
});
