import { Delivery, DepotSettings } from '../types';

export const defaultDepot: DepotSettings = {
  name: "Gelo Expresso - Centro de Distribuição",
  address: "Av. Brigadeiro Faria Lima, 2000 - Pinheiros, São Paulo - SP",
  lat: -23.5614,
  lng: -46.6877
};

export const sampleDeliveries: Delivery[] = [
  {
    id: "1",
    clientName: "Espetinho da Villa",
    address: "Rua Aspicuelta, 400 - Vila Madalena, São Paulo - SP",
    city: "São Paulo",
    orderDetails: "12 sacos de Gelo Moído (5kg) & 5 de Gelo em Cubo (10kg)",
    lat: -23.5518,
    lng: -46.6963,
    status: 'pending',
    sequence: 1
  },
  {
    id: "2",
    clientName: "Churrascaria Novilho de Ouro",
    address: "Rua Augusta, 2500 - Cerqueira César, São Paulo - SP",
    city: "São Paulo",
    orderDetails: "25 sacos de Gelo Gourmet Cubo Grande (5kg)",
    lat: -23.5678,
    lng: -46.6662,
    status: 'pending',
    sequence: 2
  },
  {
    id: "3",
    clientName: "Quiosque Lago do Ibirapuera",
    address: "Av. Pedro Álvares Cabral - Parque do Ibirapuera, São Paulo - SP",
    city: "São Paulo",
    orderDetails: "20 sacos de Gelo Escamado para bebidas (10kg)",
    lat: -23.5874,
    lng: -46.6576,
    status: 'pending',
    sequence: 3
  },
  {
    id: "4",
    clientName: "Padaria e Confeitaria Moema",
    address: "Av. Moema, 350 - Moema, São Paulo - SP",
    city: "São Paulo",
    orderDetails: "10 sacos de Gelo Moído (5kg)",
    lat: -23.6012,
    lng: -46.6712,
    status: 'pending',
    sequence: 4
  },
  {
    id: "5",
    clientName: "Bar e Adega do Itaim",
    address: "Rua Tabapuã, 800 - Itaim Bibi, São Paulo - SP",
    city: "São Paulo",
    orderDetails: "15 sacos de Gelo de Coco (2kg) & 15 de Gelo em Cubo",
    lat: -23.5835,
    lng: -46.6782,
    status: 'pending',
    sequence: 5
  }
];
