const fs = require('fs');
const path = require('path');

const base64Input = process.argv[2] || process.env.BASE64_SECRET;
const outputPath = process.argv[3];

if (!base64Input) {
    console.error('Uso: node decode_secret_file.js <base64-string> <caminho-destino>');
    console.error('Ou:   BASE64_SECRET=<string> node decode_secret_file.js <caminho-destino>');
    process.exit(1);
}

if (!outputPath) {
    console.error('Erro: Caminho de destino não informado.');
    process.exit(1);
}

const resolvedPath = path.resolve(outputPath);
const buffer = Buffer.from(base64Input, 'base64');
fs.writeFileSync(resolvedPath, buffer);
console.log(`Arquivo decodificado salvo em: ${resolvedPath}`);
