import React, { useState, useEffect, useRef } from 'react';
import { Delivery, DepotSettings } from '../types';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { X, Search, Sparkles, AlertTriangle, Check, MapPin, Hash } from 'lucide-react';

const PLACES_TIMEOUT_MS = 8000;

interface AddEditDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (delivery: Omit<Delivery, 'sequence' | 'status'> & { id?: string }) => void;
  editingDelivery: Delivery | null;
  depot: DepotSettings;
}

export default function AddEditDeliveryModal({
  isOpen,
  onClose,
  onSave,
  editingDelivery,
  depot,
}: AddEditDeliveryModalProps) {
  const [clientName, setClientName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('São Paulo');
  const [orderDetails, setOrderDetails] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  const [addressSuggestions, setAddressSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [searchMode, setSearchMode] = useState<'text' | 'cep'>('text');
  const [cepInput, setCepInput] = useState('');
  const [isSearchingCep, setIsSearchingCep] = useState(false);

  const placesLib = useMapsLibrary('places');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const placesTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editingDelivery) {
      setClientName(editingDelivery.clientName);
      setAddress(editingDelivery.address);
      setCity(editingDelivery.city);
      setOrderDetails(editingDelivery.orderDetails);
      setLat(editingDelivery.lat);
      setLng(editingDelivery.lng);
    } else {
      setClientName('');
      setAddress('');
      setCity('São Paulo');
      setOrderDetails('10 sacos de Gelo em Cubo (5kg)');
      setLat(null);
      setLng(null);
    }
    setAddressSuggestions([]);
    setSearchError('');
    setSearchMode('text');
    setCepInput('');
  }, [editingDelivery, isOpen]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (placesTimeoutRef.current) clearTimeout(placesTimeoutRef.current);
    };
  }, []);

  const handleCepSearch = async () => {
    const cleanCep = cepInput.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      setSearchError('CEP inválido. Digite 8 números.');
      return;
    }
    setIsSearchingCep(true);
    setSearchError('');
    setAddressSuggestions([]);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      if (!resp.ok) throw new Error('Falha na consulta ViaCEP');
      const data = await resp.json();
      if (data.erro) {
        setSearchError('CEP não encontrado.');
        return;
      }
      const fullAddress = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
      setAddress(fullAddress);
      setCity(data.localidade);
      setSearchMode('text');

      // Geocode the address via Nominatim to get coordinates
      try {
        const geoResp = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1&countrycodes=br`,
          { headers: { 'Accept-Language': 'pt-BR' } }
        );
        const geoData = await geoResp.json();
        if (geoData && geoData[0]) {
          setLat(parseFloat(geoData[0].lat));
          setLng(parseFloat(geoData[0].lon));
        }
      } catch {
        // Coordinates not required to proceed
      }
    } catch (err) {
      setSearchError('Erro ao buscar CEP. Verifique sua conexão.');
    } finally {
      setIsSearchingCep(false);
    }
  };

  // Handle address input prediction lookups via Google Places
  useEffect(() => {
    if (searchMode !== 'text') return;
    if (!placesLib || !address || address.length < 4 || editingDelivery?.address === address) {
      setAddressSuggestions([]);
      return;
    }

    const Places = window.google.maps.places;
    if (!Places || !Places.AutocompleteService) return;

    const autocompleteService = new Places.AutocompleteService();
    let timedOut = false;

    // Timeout: if Places API doesn't respond, show error instead of loading forever
    placesTimeoutRef.current = setTimeout(() => {
      timedOut = true;
      setIsSearching(false);
      setSearchError('Google Places não respondeu. Tente buscar por CEP.');
    }, PLACES_TIMEOUT_MS);

    searchTimeoutRef.current = setTimeout(() => {
      setIsSearching(true);
      autocompleteService.getPlacePredictions(
        {
          input: address,
          locationBias: new google.maps.LatLng(depot.lat, depot.lng),
          radius: 50000,
          language: 'pt-BR',
        },
        (predictions, status) => {
          if (timedOut) return;
          if (placesTimeoutRef.current) clearTimeout(placesTimeoutRef.current);
          setIsSearching(false);

          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            setAddressSuggestions(predictions);
            setSearchError('');
          } else {
            setAddressSuggestions([]);
            switch (status) {
              case window.google.maps.places.PlacesServiceStatus.ZERO_RESULTS:
                setSearchError('Nenhum endereço encontrado. Tente buscar por CEP.');
                break;
              case window.google.maps.places.PlacesServiceStatus.REQUEST_DENIED:
                setSearchError('API Places não habilitada para esta chave Google.');
                break;
              case window.google.maps.places.PlacesServiceStatus.INVALID_REQUEST:
                setSearchError('Endereço inválido. Tente ser mais específico.');
                break;
              default:
                setSearchError('Erro ao buscar endereços. Tente buscar por CEP.');
            }
          }
        }
      );
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (placesTimeoutRef.current) clearTimeout(placesTimeoutRef.current);
    };
  }, [address, placesLib, depot, searchMode]);

  const handleSelectSuggestion = (suggestion: google.maps.places.AutocompletePrediction) => {
    setAddress(suggestion.description);
    setAddressSuggestions([]);

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const location = results[0].geometry.location;
        setLat(location.lat());
        setLng(location.lng());
        const cityComp = results[0].address_components.find(
          (c) => c.types.includes('locality') || c.types.includes('administrative_area_level_2')
        );
        if (cityComp) {
          setCity(cityComp.long_name);
        }
        setSearchError('');
      } else {
        setSearchError('Não foi possível carregar as coordenadas exatas deste endereço.');
      }
    });
  };

  const geocodeWithNominatim = async (addr: string): Promise<{ lat: number; lng: number } | null> => {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1&countrycodes=br`,
        { headers: { 'Accept-Language': 'pt-BR' } }
      );
      const data = await resp.json();
      if (data && data[0]) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
    } catch {
      // Silently fail
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim() || !address.trim() || !orderDetails.trim()) return;

    if (lat === null || lng === null) {
      // Try Nominatim as fallback geocoder (no API key needed)
      const coords = await geocodeWithNominatim(address);
      if (coords) {
        onSave({
          id: editingDelivery?.id,
          clientName,
          address,
          city,
          orderDetails,
          lat: coords.lat,
          lng: coords.lng,
        });
        onClose();
        return;
      }

      // Add anyways but with null lat lng
      onSave({
        id: editingDelivery?.id,
        clientName,
        address,
        city,
        orderDetails,
        lat: null,
        lng: null,
      });
      onClose();
    } else {
      onSave({
        id: editingDelivery?.id,
        clientName,
        address,
        city,
        orderDetails,
        lat,
        lng,
      });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#090d16]/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in print:hidden">
      <div className="bg-[#131d31]/95 backdrop-blur-2xl rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-white/15 flex flex-col text-white">
        {/* Header */}
        <div className="px-5 py-4 bg-white/5 border-b border-white/10 flex justify-between items-center">
          <div>
            <h3 className="font-extrabold text-white text-base">
              {editingDelivery ? 'Editar Entrega' : 'Nova Entrega de Gelo'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Defina o cliente, endereço e detalhes do pedido</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Client Name */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">CLIENTE / PONTO COMERCIAL</label>
            <input
              type="text"
              required
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Ex: Pizzaria Forno de Barro, Quiosque Copacabana"
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans"
            />
          </div>

          {/* Search Mode Toggle */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-0.5 border border-white/10">
            <button
              type="button"
              onClick={() => { setSearchMode('text'); setSearchError(''); setAddressSuggestions([]); }}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                searchMode === 'text' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search size={11} /> Buscar Endereço
            </button>
            <button
              type="button"
              onClick={() => { setSearchMode('cep'); setSearchError(''); setAddressSuggestions([]); }}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                searchMode === 'cep' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Hash size={11} /> Buscar por CEP
            </button>
          </div>

          {/* Address Search by Text (Google Places) */}
          {searchMode === 'text' && (
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ENDEREÇO DA ENTREGA</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Av. Paulista, 1000 - Bela Vista"
                  className="w-full text-xs pl-9 pr-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans"
                />
                <Search size={14} className="absolute left-3.5 top-3 text-slate-400" />
              </div>

              {isSearching && (
                <div className="absolute left-0 right-0 mt-1.5 bg-[#17253f] border border-white/10 rounded-xl p-2.5 shadow-xl text-[11px] text-slate-300 z-30 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                  <span>Procurando endereços pelo Google...</span>
                </div>
              )}

              {addressSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 bg-[#17253f]/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl z-40 max-h-48 overflow-y-auto divide-y divide-white/10">
                  {addressSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.place_id}
                      type="button"
                      onClick={() => handleSelectSuggestion(suggestion)}
                      className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-blue-600/30 text-slate-200 hover:text-white transition-all flex items-start gap-2 cursor-pointer"
                    >
                      <MapPin size={13} className="mt-0.5 text-blue-400 shrink-0" />
                      <span>{suggestion.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Address Search by CEP (ViaCEP) */}
          {searchMode === 'cep' && (
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">BUSCAR POR CEP</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={cepInput}
                  onChange={(e) => setCepInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="Digite o CEP (apenas números)"
                  maxLength={8}
                  className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans"
                />
                <button
                  type="button"
                  onClick={handleCepSearch}
                  disabled={isSearchingCep || cepInput.length < 8}
                  className="px-4 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isSearchingCep ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Search size={13} />
                  )}
                  Buscar
                </button>
              </div>
              {address && searchMode === 'cep' && (
                <div className="mt-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
                  <div className="font-bold mb-0.5">Endereço encontrado:</div>
                  <div>{address}</div>
                  {lat && lng && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-300 font-bold">
                      <Check size={10} strokeWidth={3} /> Geolocalizado automaticamente
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Geolocation status & error messages */}
          {lat && lng && searchMode === 'text' && (
            <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md inline-flex">
              <Check size={10} strokeWidth={3} /> Geolocalizado com sucesso
            </div>
          )}

          {searchError && (
            <div className="text-[10px] text-rose-400 flex items-center gap-1 font-semibold">
              <AlertTriangle size={12} /> {searchError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* City */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">CIDADE</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: São Paulo"
                className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Ice bags details preset suggestions */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ATALHO DE PEDIDO</label>
              <select
                onChange={(e) => {
                  if (e.target.value) setOrderDetails(e.target.value);
                }}
                className="w-full text-xs px-2.5 py-2.5 rounded-xl border border-white/10 bg-[#17253f] text-white leading-tight focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Escolha um --</option>
                <option value="10 sacos de Gelo em Cubo (5kg)">10x Cubo (5kg)</option>
                <option value="15 sacos de Gelo Moído (5kg)">15x Moído (5kg)</option>
                <option value="20 sacos de Gelo Escamado (10kg)">20x Escamado (10kg)</option>
                <option value="30 sacos Mistos (Gourmet + Cubo)">30x Mistos Gourmet</option>
                <option value="8 sacas de Gelo de Coco (2kg)">8x Coco (2kg)</option>
              </select>
            </div>
          </div>

          {/* Order Details text */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">DETALHES DO PEDIDO (PRODUTOS)</label>
            <textarea
              required
              rows={3}
              value={orderDetails}
              onChange={(e) => setOrderDetails(e.target.value)}
              placeholder="Insira detalhes das quantidades de sacos de gelo..."
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
            />
          </div>

          {/* Footer Action Buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 text-xs font-bold border border-white/10 rounded-xl text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 py-3 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-1 cursor-pointer hover:scale-[1.01] active:scale-98"
            >
              <Sparkles size={14} className="fill-current text-white/95" />
              Salvar Entrega
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
