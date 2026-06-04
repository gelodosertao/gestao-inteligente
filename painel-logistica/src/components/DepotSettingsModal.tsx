import React, { useState, useEffect } from 'react';
import { DepotSettings } from '../types';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { X, Check } from 'lucide-react';

interface DepotSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDepot: DepotSettings;
  onSave: (depot: DepotSettings) => void;
}

export default function DepotSettingsModal({
  isOpen,
  onClose,
  currentDepot,
  onSave,
}: DepotSettingsModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);

  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (currentDepot) {
      setName(currentDepot.name);
      setAddress(currentDepot.address);
      setLat(currentDepot.lat);
      setLng(currentDepot.lng);
    }
    setAddressSuggestions([]);
    setStatusMsg('');
  }, [currentDepot, isOpen]);

  // Handle autocomplete predictions
  useEffect(() => {
    if (!placesLib || !address || address.length < 5 || address === currentDepot.address) {
      setAddressSuggestions([]);
      return;
    }

    const autocompleteService = new window.google.maps.places.AutocompleteService();
    const timeoutId = setTimeout(() => {
      autocompleteService.getPlacePredictions(
        {
          input: address,
          types: ['geocode', 'establishment'],
          language: 'pt-BR',
        },
        (predictions, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            setAddressSuggestions(predictions);
          } else {
            setAddressSuggestions([]);
          }
        }
      );
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [address, placesLib, currentDepot]);

  const handleSelectSuggestion = (suggestion: google.maps.places.AutocompletePrediction) => {
    setAddress(suggestion.description);
    setAddressSuggestions([]);

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ placeId: suggestion.place_id }, (results, status) => {
      if (status === 'OK' && results && results[0]) {
        const location = results[0].geometry.location;
        setLat(location.lat());
        setLng(location.lng());
        setStatusMsg('Origem identificada!');
      } else {
        setStatusMsg('Erro ao geolocalizar este endereço de depósito.');
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) return;

    if (lat === 0 || lng === 0) {
      // Fallback geocoding of raw string
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          onSave({
            name,
            address: results[0].formatted_address,
            lat: loc.lat(),
            lng: loc.lng(),
          });
          onClose();
        } else {
          setStatusMsg('Endereço inválido. Favor selecionar um endereço sugerido.');
        }
      });
    } else {
      onSave({
        name,
        address,
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
            <h3 className="font-extrabold text-white text-base">Configurar Distribuidora</h3>
            <p className="text-xs text-slate-400 mt-0.5">Defina a localização central de partida dos entregadores</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 flex-1 min-h-0 overflow-y-auto space-y-4">
          {/* Depot Name */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">NOME DA FÁBRICA / DEPÓSITO</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Gelo Expresso CD"
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans"
            />
          </div>

          {/* Depot Address */}
          <div className="relative">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ENDEREÇO DA DISTRIBUIDORA</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ex: Av. Faria Lima, 2000 - São Paulo"
              className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-white/10 bg-white/5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all font-sans font-sans"
            />

            {addressSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-[#17253f]/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl z-20 max-h-48 overflow-y-auto divide-y divide-white/10">
                {addressSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.place_id}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-blue-600/30 text-slate-200 hover:text-white transition-all flex items-start gap-2 cursor-pointer"
                  >
                    <span className="text-blue-400 shrink-0">📍</span>
                    <span>{suggestion.description}</span>
                  </button>
                ))}
              </div>
            )}

            {lat !== 0 && (
              <div className="mt-2.5 flex items-center gap-1 text-[10px] text-emerald-300 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md inline-flex">
                <Check size={10} strokeWidth={3} /> Depósito Ajustado
              </div>
            )}

            {statusMsg && (
              <p className="text-[10px] text-slate-400 font-medium tracking-wide mt-1.5">{statusMsg}</p>
            )}
          </div>

          {/* Actions */}
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
              className="flex-1 py-3 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all cursor-pointer hover:scale-[1.01] active:scale-98"
            >
              Salvar Alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
