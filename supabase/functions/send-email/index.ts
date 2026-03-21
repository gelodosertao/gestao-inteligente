import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Tratamento de CORS para o navegador
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (!BREVO_API_KEY) {
            throw new Error("BREVO_API_KEY não configurada Edge Function");
        }

        // Lê o corpo da requisição (to, subject, html) enviados pelo CRM
        const { to, subject, html } = await req.json();

        if (!to || !subject || !html) {
            throw new Error("Parâmetros 'to', 'subject' e 'html' são obrigatórios");
        }

        // Faz a chamada para a API do Brevo v3
        const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": BREVO_API_KEY,
                "Accept": "application/json",
            },
            body: JSON.stringify({
                sender: {
                    name: "Consultor Gelo do Sertão",
                    email: "joaobolega@gmail.com", // <-- ALTERE SE NECESSÁRIO PARA O SEU E-MAIL NO BREVO
                },
                to: [
                    {
                        email: to,
                    },
                ],
                subject: subject,
                htmlContent: html,
            }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            console.error("Erro do Brevo:", data, res.status);
            throw new Error(data.message || "Erro ao enviar e-mail via Brevo");
        }

        return new Response(JSON.stringify({ success: true, data }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    } catch (error: any) {
        console.error("Erro no Edge Function:", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
