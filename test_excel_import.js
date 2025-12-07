import pkg from 'xlsx';
const { utils, writeFile, readFile } = pkg;
import { randomUUID } from 'crypto';

// 1. Create a sample Excel file with "messy" headers to test the robust logic
const sampleData = [
    {
        "NOME DO CLIENTE": "João Silva",
        "cpf": "123.456.789-00",
        "RAMO de atividade": "Mercadinho",
        "Cidade (Sede)": "Petrolina",
        "Contato (Whatsapp)": "87999999999"
    },
    {
        "Razão Social": "Maria Souza LTDA",
        "CNPJ": "00.000.000/0001-00",
        "Segmento": "Restaurante",
        "Municipio": "Juazeiro",
        "Tel": "74888888888"
    }
];

const workbook = utils.book_new();
const worksheet = utils.json_to_sheet(sampleData);
utils.book_append_sheet(workbook, worksheet, "Clientes");
writeFile(workbook, "teste_importacao.xlsx");

console.log("Arquivo 'teste_importacao.xlsx' criado com sucesso.");

// 2. Read the file back to simulate the upload process
console.log("Lendo arquivo...");
const wb = readFile("teste_importacao.xlsx");
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = utils.sheet_to_json(sheet);

console.log("Dados brutos do Excel:", data);

// 3. Apply the EXACT logic from Customers.tsx
console.log("\nProcessando dados com a lógica inteligente...");

const processImportedData = (data) => {
    if (data.length === 0) {
        console.log("O arquivo está vazio.");
        return;
    }

    const normalizeKey = (key) => key.trim().toLowerCase();

    const parsedCustomers = data.map((row) => {
        // Create a normalized map of the row for easier lookup
        const normalizedRow = {};
        Object.keys(row).forEach(key => {
            normalizedRow[normalizeKey(key)] = row[key];
        });

        const getValue = (possibleKeys) => {
            for (const key of possibleKeys) {
                const normalized = normalizeKey(key);
                if (normalizedRow[normalized] !== undefined) return normalizedRow[normalized];
            }
            return undefined;
        };

        // Helper to find value by partial match if exact match fails
        const findValue = (possibleKeys) => {
            let val = getValue(possibleKeys);
            if (val !== undefined) return val;

            // Fallback: check if any row key contains one of the possible keys
            for (const rowKey of Object.keys(normalizedRow)) {
                for (const key of possibleKeys) {
                    if (rowKey.includes(normalizeKey(key))) {
                        return normalizedRow[rowKey];
                    }
                }
            }
            return '';
        };

        return {
            id: randomUUID(),
            name: findValue(['Nome', 'Name', 'Cliente', 'Razão Social', 'Razao Social']) || 'Sem Nome',
            cpfCnpj: findValue(['CPF', 'CNPJ', 'CpfCnpj', 'Documento']) || '',
            email: findValue(['Email', 'E-mail', 'Correo']) || '',
            phone: findValue(['Telefone', 'Phone', 'Celular', 'Tel', 'Contato', 'Whatsapp']) || '',
            address: findValue(['Endereço', 'Endereco', 'Address', 'Logradouro', 'Rua']) || '',
            segment: findValue(['Ramo', 'Segment', 'Atividade', 'Categoria']) || '',
            city: findValue(['Cidade', 'City', 'Municipio', 'Localidade']) || '',
            state: findValue(['Estado', 'State', 'UF']) || ''
        };
    }).filter(c => c.name !== 'Sem Nome');

    if (parsedCustomers.length > 0) {
        console.log(`\nSUCESSO: ${parsedCustomers.length} clientes identificados!`);
        console.log(JSON.stringify(parsedCustomers, null, 2));
    } else {
        const firstRowKeys = Object.keys(data[0]).join(', ');
        console.log(`FALHA: Nenhum cliente válido encontrado. Colunas identificadas: ${firstRowKeys}`);
    }
};

processImportedData(data);
