const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const invoiceApiUrl = import.meta.env.VITE_INVOICE_API_URL;
const googleMapsPlatformKey = import.meta.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;

if (!supabaseUrl) {
    throw new Error("VITE_SUPABASE_URL não definida no ambiente");
}
if (!supabaseAnonKey) {
    throw new Error("VITE_SUPABASE_ANON_KEY não definida no ambiente");
}

export { supabaseUrl, supabaseAnonKey, invoiceApiUrl, googleMapsPlatformKey };
