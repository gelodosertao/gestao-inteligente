const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

if (!filePath) {
    console.error('Uso: node encode_secret_file.js <caminho-do-arquivo>');
    process.exit(1);
}

const resolvedPath = path.resolve(filePath);

if (!fs.existsSync(resolvedPath)) {
    console.error(`Erro: Arquivo não encontrado: ${resolvedPath}`);
    process.exit(1);
}

const buffer = fs.readFileSync(resolvedPath);
const base64 = buffer.toString('base64');
console.log(base64);
