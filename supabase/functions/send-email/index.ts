import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function isValidEmail(email: unknown): email is string {
  return typeof email === "string"
    && email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isAuthorizedProfile(profile: { role?: string | null; allowed_modules?: string[] | null } | null): boolean {
  if (!profile) return false;

  const role = (profile.role || "").trim().toUpperCase();
  if (["ADMIN", "ADMINISTRADOR", "ADMINISTRADOR_SISTEMA"].includes(role)) {
    return true;
  }

  return (profile.allowed_modules || []).some((module) => module.toUpperCase() === "CRM");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Metodo nao permitido" }, 405);
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error("Configuracao Supabase ausente na Edge Function send-email");
      return jsonResponse({ error: "Servico indisponivel" }, 503);
    }

    if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
      console.error("Configuracao Brevo ausente na Edge Function send-email");
      return jsonResponse({ error: "Servico de e-mail indisponivel" }, 503);
    }

    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Nao autorizado" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      console.warn("Tentativa de envio com JWT invalido:", authError?.message);
      return jsonResponse({ error: "Nao autorizado" }, 401);
    }

    const { data: profile, error: profileError } = await supabase
      .from("app_users")
      .select("role, allowed_modules")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) {
      console.warn("Falha ao consultar perfil para envio de e-mail:", profileError.message);
      return jsonResponse({ error: "Acesso negado" }, 403);
    }

    if (!isAuthorizedProfile(profile)) {
      return jsonResponse({ error: "Acesso negado" }, 403);
    }

    const { to, subject, html } = await req.json();

    if (!isValidEmail(to)) {
      return jsonResponse({ error: "Destinatario invalido" }, 400);
    }

    if (typeof subject !== "string" || subject.trim().length === 0 || subject.length > 200) {
      return jsonResponse({ error: "Assunto invalido" }, 400);
    }

    if (typeof html !== "string" || html.trim().length === 0 || html.length > 100_000) {
      return jsonResponse({ error: "Conteudo invalido" }, 400);
    }

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": BREVO_API_KEY,
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: {
          name: "Consultor Gelo do Sertao",
          email: BREVO_SENDER_EMAIL,
        },
        to: [{ email: to.trim() }],
        subject: subject.trim(),
        htmlContent: html,
      }),
    });

    const data = await brevoResponse.json().catch(() => ({}));

    if (!brevoResponse.ok) {
      console.error("Erro do Brevo:", { status: brevoResponse.status, message: data?.message });
      return jsonResponse({ error: "Erro ao enviar e-mail" }, 502);
    }

    return jsonResponse({ success: true, data }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Erro no Edge Function send-email:", message);
    return jsonResponse({ error: "Erro interno. Tente novamente." }, 500);
  }
});
