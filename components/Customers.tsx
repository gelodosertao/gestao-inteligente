import React, { useState, useRef } from 'react';
import { User, Customer, Branch } from '../types';
import { Users, Plus, Upload, Search, Trash2, Save, X, FileText, Edit, ArrowLeft, ArrowUpDown, ArrowUp, ArrowDown, Building2 } from 'lucide-react';
import { read, utils } from 'xlsx';

interface CustomersProps {
    customers: Customer[];
    onAddCustomer: (customer: Customer) => void;
    onImportCustomers: (customers: Customer[]) => void;
    currentUser: User;
    onUpdateCustomer: (customer: Customer) => void;
    onDeleteCustomer: (customerId: string) => void;
    onBack: () => void;
}

const CUSTOMER_SEGMENTS = [
    'Adega',
    'Ambulante',
    'Atacadista',
    'Bar',
    'Conveniência',
    'Distribuidora',
    'Eventos',
    'Geleiro',
    'Mercadinho',
    'Restaurante',
    'Supermercado'
];

const Customers: React.FC<CustomersProps> = ({ customers, onAddCustomer, onImportCustomers, currentUser, onUpdateCustomer, onDeleteCustomer, onBack }) => {
    // ... existing state ...
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({ branch: Branch.MATRIZ });
    const [cepInput, setCepInput] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' } | null>({ key: 'segment', direction: 'asc' });
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ... existing functions ...
    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.cpfCnpj?.includes(searchTerm)
    );

    const handleSort = (key: keyof Customer) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedCustomers = [...filteredCustomers].sort((a, b) => {
        if (!sortConfig) return 0;

        const { key, direction } = sortConfig;

        const valueA = (a[key] || '').toString().toLowerCase();
        const valueB = (b[key] || '').toString().toLowerCase();

        if (valueA < valueB) {
            return direction === 'asc' ? -1 : 1;
        }
        if (valueA > valueB) {
            return direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    const fetchAddress = async (isEditing: boolean) => {
        // ... existing fetchAddress logic ...
        const cleanCep = cepInput.replace(/\D/g, '');
        if (cleanCep.length !== 8) {
            alert("CEP inválido. Digite 8 números.");
            return;
        }

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
            const data = await response.json();

            if (data.erro) {
                alert("CEP não encontrado.");
                return;
            }

            const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;

            if (isEditing && editingCustomer) {
                setEditingCustomer({
                    ...editingCustomer,
                    address: fullAddress,
                    city: data.localidade,
                    state: data.uf
                });
            } else {
                setNewCustomer({
                    ...newCustomer,
                    address: fullAddress,
                    city: data.localidade,
                    state: data.uf
                });
            }
        } catch (error) {
            console.error("Erro ao buscar CEP:", error);
            alert("Erro ao buscar endereço. Verifique sua conexão.");
        }
    };

    const handleSaveCustomer = () => {
        if (!newCustomer.name) return;

        const customer: Customer = {
            id: crypto.randomUUID(),
            name: newCustomer.name,
            cpfCnpj: newCustomer.cpfCnpj || '',
            email: newCustomer.email || '',
            phone: newCustomer.phone || '',
            address: newCustomer.address || '',
            segment: newCustomer.segment || '',
            city: newCustomer.city || '',
            state: newCustomer.state || '',
            branch: newCustomer.branch
        };

        onAddCustomer(customer);
        setShowAddModal(false);
        setNewCustomer({ branch: Branch.MATRIZ });
        setCepInput('');
    };

    const handleUpdateCustomerSave = () => {
        if (!editingCustomer || !editingCustomer.name) return;
        onUpdateCustomer(editingCustomer);
        setShowEditModal(false);
        setEditingCustomer(null);
        setCepInput('');
    };

    const openEditModal = (customer: Customer) => {
        setEditingCustomer({ ...customer });
        setCepInput('');
        setShowEditModal(true);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();

        if (file.name.endsWith('.xml')) {
            reader.onload = (e) => {
                const text = e.target?.result as string;
                parseXML(text);
            };
            reader.readAsText(file);
        } else {
            reader.onload = (e) => {
                const data = e.target?.result;
                try {
                    const workbook = read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = utils.sheet_to_json(sheet);
                    processImportedData(json);
                } catch (error) {
                    console.error("Erro ao ler arquivo Excel:", error);
                    alert("Erro ao processar arquivo. Verifique se é um Excel válido.");
                }
            };
            reader.readAsArrayBuffer(file);
        }
    };

    const processImportedData = (data: any[]) => {
        if (data.length === 0) {
            alert("O arquivo está vazio.");
            return;
        }

        const normalizeKey = (key: string) => key.trim().toLowerCase();

        const parsedCustomers: Customer[] = data.map((row: any) => {
            // Create a normalized map of the row for easier lookup
            const normalizedRow: Record<string, any> = {};
            Object.keys(row).forEach(key => {
                normalizedRow[normalizeKey(key)] = row[key];
            });

            const getValue = (possibleKeys: string[]) => {
                for (const key of possibleKeys) {
                    const normalized = normalizeKey(key);
                    if (normalizedRow[normalized] !== undefined) return normalizedRow[normalized];
                }
                return undefined;
            };

            // Helper to find value by partial match if exact match fails
            const findValue = (possibleKeys: string[]) => {
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
                id: crypto.randomUUID(),
                name: findValue(['Nome', 'Name', 'Cliente', 'Razão Social', 'Razao Social', 'Titular']) || 'Sem Nome',
                cpfCnpj: findValue(['CPF', 'CNPJ', 'CpfCnpj', 'Documento', 'Doc']) || '',
                email: findValue(['Email', 'E-mail', 'Correo', 'Mail']) || '',
                phone: findValue(['Telefone', 'Phone', 'Celular', 'Tel', 'Contato', 'Whatsapp', 'Cel']) || '',
                address: findValue(['Endereço', 'Endereco', 'Address', 'Logradouro', 'Rua', 'Av', 'Avenida']) || '',
                segment: findValue(['Ramo', 'Segment', 'Atividade', 'Categoria', 'Setor', 'Tipo', 'Classificação', 'Classificacao', 'Area']) || '',
                city: findValue(['Cidade', 'City', 'Municipio', 'Localidade', 'Local', 'Sede', 'Município']) || '',
                state: findValue(['Estado', 'State', 'UF', 'Provincia']) || '',
                branch: Branch.MATRIZ // Default imported to Matriz for now, or could try to detect
            };
        }).filter(c => c.name !== 'Sem Nome');

        if (parsedCustomers.length > 0) {
            onImportCustomers(parsedCustomers);
            alert(`${parsedCustomers.length} clientes importados com sucesso!`);
        } else {
            const firstRowKeys = Object.keys(data[0]).join(', ');
            alert(`Nenhum cliente válido encontrado. Colunas identificadas: ${firstRowKeys}. Verifique se existe uma coluna de Nome.`);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const parseXML = (xmlText: string) => {
        // ... existing logic ...
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            const customerNodes = xmlDoc.getElementsByTagName("Customer"); // Adjust tag name as needed

            // If no "Customer" tags, try generic "item" or look for structure
            const nodesToProcess = customerNodes.length > 0 ? customerNodes : xmlDoc.getElementsByTagName("cliente");

            const parsedCustomers: Customer[] = [];

            for (let i = 0; i < nodesToProcess.length; i++) {
                const node = nodesToProcess[i];
                const name = node.getElementsByTagName("Name")[0]?.textContent || node.getElementsByTagName("nome")[0]?.textContent || "Sem Nome";
                const cpfCnpj = node.getElementsByTagName("CpfCnpj")[0]?.textContent || node.getElementsByTagName("cpf_cnpj")[0]?.textContent || "";
                const email = node.getElementsByTagName("Email")[0]?.textContent || node.getElementsByTagName("email")[0]?.textContent || "";

                parsedCustomers.push({
                    id: crypto.randomUUID(),
                    name: name,
                    cpfCnpj: cpfCnpj,
                    email: email,
                    branch: Branch.MATRIZ // Default
                });
            }

            if (parsedCustomers.length > 0) {
                onImportCustomers(parsedCustomers);
                alert(`${parsedCustomers.length} clientes importados com sucesso!`);
            } else {
                alert("Nenhum cliente encontrado no arquivo XML. Verifique o formato.");
            }
        } catch (error) {
            console.error("Erro ao processar XML:", error);
            alert("Erro ao ler arquivo XML.");
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    };



    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
                        <ArrowLeft size={24} className="text-slate-600" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Clientes</h2>
                        <p className="text-slate-500">Gerencie sua base de clientes e importações.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                    >
                        <Upload size={18} /> Importar (Excel/XML)
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xml,.xlsx,.xls,.csv"
                        className="hidden"
                    />
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="bg-blue-800 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-lg shadow-blue-900/10 transition-colors"
                    >
                        <Plus size={18} /> Novo Cliente
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex gap-4 items-center">
                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou CPF/CNPJ..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <span className="text-sm text-slate-500 font-medium">
                        {customers.length} clientes cadastrados
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600">
                        <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('name')}>
                                    <div className="flex items-center gap-1">
                                        Nome
                                        {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('cpfCnpj')}>
                                    <div className="flex items-center gap-1">
                                        CPF / CNPJ
                                        {sortConfig?.key === 'cpfCnpj' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('segment')}>
                                    <div className="flex items-center gap-1">
                                        Ramo
                                        {sortConfig?.key === 'segment' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('phone')}>
                                    <div className="flex items-center gap-1">
                                        Telefone
                                        {sortConfig?.key === 'phone' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('city')}>
                                    <div className="flex items-center gap-1">
                                        Cidade
                                        {sortConfig?.key === 'city' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </div>
                                </th>
                                <th className="px-6 py-3 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('state')}>
                                    <div className="flex items-center gap-1">
                                        Estado
                                        {sortConfig?.key === 'state' && (sortConfig.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedCustomers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum cliente encontrado.
                                    </td>
                                </tr>
                            ) : (
                                sortedCustomers.map((customer) => (
                                    <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 font-medium text-slate-800">
                                            {customer.name}
                                            {customer.branch && (
                                                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border ${customer.branch === Branch.MATRIZ ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                                                    {customer.branch === Branch.MATRIZ ? 'Matriz' : 'Filial'}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 text-slate-500 text-xs">{customer.cpfCnpj || '-'}</td>
                                        <td className="px-6 py-3">
                                            {customer.segment ? (
                                                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs font-bold border border-blue-100">
                                                    {customer.segment}
                                                </span>
                                            ) : (
                                                <span className="text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">{customer.phone || '-'}</td>
                                        <td className="px-6 py-3 font-bold text-blue-800 bg-blue-50/30">{customer.city || '-'}</td>
                                        <td className="px-6 py-3">{customer.state || '-'}</td>
                                        <td className="px-6 py-3 text-right flex justify-end gap-2">
                                            {currentUser.role === 'ADMIN' && (
                                                <button
                                                    onClick={() => openEditModal(customer)}
                                                    className="text-slate-400 hover:text-blue-600 p-1"
                                                    title="Editar Cliente"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                            )}
                                            {currentUser.role === 'ADMIN' && (
                                                <button
                                                    onClick={() => onDeleteCustomer(customer.id)}
                                                    className="text-slate-400 hover:text-red-600 p-1"
                                                    title="Excluir Cliente"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ADD CUSTOMER MODAL */}
            {showAddModal && (
                <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2">
                                <Users size={20} className="text-orange-400" /> Novo Cliente
                            </h3>
                            <button onClick={() => setShowAddModal(false)}><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Unidade (Origem)</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setNewCustomer({ ...newCustomer, branch: Branch.MATRIZ })}
                                        className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${newCustomer.branch === Branch.MATRIZ ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <Building2 size={16} /> Matriz
                                    </button>
                                    <button
                                        onClick={() => setNewCustomer({ ...newCustomer, branch: Branch.FILIAL })}
                                        className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${newCustomer.branch === Branch.FILIAL ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <Building2 size={16} /> Filial
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nome Completo</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={newCustomer.name || ''}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Ramo de Atividade</label>
                                <select
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                    value={newCustomer.segment || ''}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, segment: e.target.value })}
                                >
                                    <option value="">Selecione...</option>
                                    {CUSTOMER_SEGMENTS.map(segment => (
                                        <option key={segment} value={segment}>{segment}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">CPF / CNPJ</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        value={newCustomer.cpfCnpj || ''}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, cpfCnpj: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Telefone</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        value={newCustomer.phone || ''}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={newCustomer.email || ''}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Endereço Completo</label>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        className="w-32 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                                        placeholder="CEP (Opcional)"
                                        value={cepInput}
                                        onChange={(e) => setCepInput(e.target.value)}
                                        maxLength={9}
                                    />
                                    <button
                                        onClick={() => fetchAddress(false)}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs transition-colors"
                                    >
                                        Buscar CEP
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mb-3"
                                    value={newCustomer.address || ''}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                    placeholder="Rua, Número, Bairro"
                                />
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Cidade</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            value={newCustomer.city || ''}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })}
                                            placeholder="Cidade"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Estado (UF)</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 uppercase"
                                            value={newCustomer.state || ''}
                                            onChange={(e) => setNewCustomer({ ...newCustomer, state: e.target.value })}
                                            placeholder="UF"
                                            maxLength={2}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleSaveCustomer}
                                className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 mt-2"
                            >
                                <Save size={18} /> Salvar Cliente
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT CUSTOMER MODAL */}
            {showEditModal && editingCustomer && (
                <div className="fixed inset-0 bg-blue-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                        <div className="p-4 bg-blue-900 text-white flex justify-between items-center">
                            <h3 className="font-bold flex items-center gap-2">
                                <Edit size={20} className="text-orange-400" /> Editar Cliente
                            </h3>
                            <button onClick={() => setShowEditModal(false)}><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Unidade (Origem)</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditingCustomer({ ...editingCustomer, branch: Branch.MATRIZ })}
                                        className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${editingCustomer.branch === Branch.MATRIZ ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <Building2 size={16} /> Matriz
                                    </button>
                                    <button
                                        onClick={() => setEditingCustomer({ ...editingCustomer, branch: Branch.FILIAL })}
                                        className={`flex-1 py-2 rounded-lg border font-medium text-sm flex items-center justify-center gap-2 ${editingCustomer.branch === Branch.FILIAL ? 'bg-orange-50 border-orange-500 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <Building2 size={16} /> Filial
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nome Completo</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={editingCustomer.name || ''}
                                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Ramo de Atividade</label>
                                <select
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                                    value={editingCustomer.segment || ''}
                                    onChange={(e) => setEditingCustomer({ ...editingCustomer, segment: e.target.value })}
                                >
                                    <option value="">Selecione...</option>
                                    {CUSTOMER_SEGMENTS.map(segment => (
                                        <option key={segment} value={segment}>{segment}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">CPF / CNPJ</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        value={editingCustomer.cpfCnpj || ''}
                                        onChange={(e) => setEditingCustomer({ ...editingCustomer, cpfCnpj: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">Telefone</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                        value={editingCustomer.phone || ''}
                                        onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={editingCustomer.email || ''}
                                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">Endereço Completo</label>
                                <div className="flex gap-2 mb-2">
                                    <input
                                        type="text"
                                        className="w-32 px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                                        placeholder="CEP (Opcional)"
                                        value={cepInput}
                                        onChange={(e) => setCepInput(e.target.value)}
                                        maxLength={9}
                                    />
                                    <button
                                        onClick={() => fetchAddress(true)}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs transition-colors"
                                    >
                                        Buscar CEP
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 mb-3"
                                    value={editingCustomer.address || ''}
                                    onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                                    placeholder="Rua, Número, Bairro"
                                />
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Cidade</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                            value={editingCustomer.city || ''}
                                            onChange={(e) => setEditingCustomer({ ...editingCustomer, city: e.target.value })}
                                            placeholder="Cidade"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Estado (UF)</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 uppercase"
                                            value={editingCustomer.state || ''}
                                            onChange={(e) => setEditingCustomer({ ...editingCustomer, state: e.target.value })}
                                            placeholder="UF"
                                            maxLength={2}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleUpdateCustomerSave}
                                className="w-full bg-blue-800 hover:bg-blue-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 mt-2"
                            >
                                <Save size={18} /> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default Customers;
