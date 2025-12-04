import React, { useState, useRef } from 'react';
import { User, Customer } from '../types';
import { Users, Plus, Upload, Search, Trash2, Save, X, FileText, Edit } from 'lucide-react';

interface CustomersProps {
    customers: Customer[];
    onAddCustomer: (customer: Customer) => void;
    onImportCustomers: (customers: Customer[]) => void;
    currentUser: User;
    onUpdateCustomer: (customer: Customer) => void;
    onDeleteCustomer: (customerId: string) => void;
}

const Customers: React.FC<CustomersProps> = ({ customers, onAddCustomer, onImportCustomers, currentUser, onUpdateCustomer, onDeleteCustomer }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [newCustomer, setNewCustomer] = useState<Partial<Customer>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.cpfCnpj?.includes(searchTerm)
    );

    const handleSaveCustomer = () => {
        if (!newCustomer.name) return;

        const customer: Customer = {
            id: crypto.randomUUID(),
            name: newCustomer.name,
            cpfCnpj: newCustomer.cpfCnpj || '',
            email: newCustomer.email || '',
            phone: newCustomer.phone || '',
            address: newCustomer.address || ''
        };

        onAddCustomer(customer);
        setShowAddModal(false);
        setNewCustomer({});
    };

    const handleUpdateCustomerSave = () => {
        if (!editingCustomer || !editingCustomer.name) return;
        onUpdateCustomer(editingCustomer);
        setShowEditModal(false);
        setEditingCustomer(null);
    };

    const openEditModal = (customer: Customer) => {
        setEditingCustomer({ ...customer });
        setShowEditModal(true);
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            parseXML(text);
        };
        reader.readAsText(file);
    };

    const parseXML = (xmlText: string) => {
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
                    email: email
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
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Clientes</h2>
                    <p className="text-slate-500">Gerencie sua base de clientes e importações.</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors"
                    >
                        <Upload size={18} /> Importar XML
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".xml"
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
                                <th className="px-6 py-3">Nome</th>
                                <th className="px-6 py-3">CPF / CNPJ</th>
                                <th className="px-6 py-3">Email</th>
                                <th className="px-6 py-3">Telefone</th>
                                <th className="px-6 py-3 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredCustomers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                        Nenhum cliente encontrado.
                                    </td>
                                </tr>
                            ) : (
                                filteredCustomers.map((customer) => (
                                    <tr key={customer.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 font-medium text-slate-800">{customer.name}</td>
                                        <td className="px-6 py-3">{customer.cpfCnpj || '-'}</td>
                                        <td className="px-6 py-3">{customer.email || '-'}</td>
                                        <td className="px-6 py-3">{customer.phone || '-'}</td>
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
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nome Completo</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={newCustomer.name || ''}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                                    autoFocus
                                />
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
                                <label className="block text-sm font-bold text-slate-700 mb-1">Endereço</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={newCustomer.address || ''}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                />
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
                                <label className="block text-sm font-bold text-slate-700 mb-1">Nome Completo</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={editingCustomer.name || ''}
                                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                                />
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
                                <label className="block text-sm font-bold text-slate-700 mb-1">Endereço</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                                    value={editingCustomer.address || ''}
                                    onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
                                />
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
