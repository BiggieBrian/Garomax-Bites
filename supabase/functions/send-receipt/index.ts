// Garomax Bites — send-receipt Edge Function
//
// Sends a plain-text receipt email via Resend (https://resend.com). Runs
// server-side so the Resend API key never ships to the browser bundle.
//
// Deploy:
//   supabase functions deploy send-receipt
//
// Configure (once, from the project root, requires the Supabase CLI logged in):
//   supabase secrets set RESEND_API_KEY=re_your_key_here
//   supabase secrets set RESEND_FROM="Garomax Bites <receipts@yourdomain.com>"
//
// RESEND_FROM must be an email address on a domain you've verified in Resend
// (Resend rejects sends from unverified domains). Until you verify a domain,
// Resend's own sandbox address (onboarding@resend.dev) works for testing.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'onboarding@resend.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendReceiptBody {
  to: string;
  subject: string;
  text: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { to, subject, text } = (await req.json()) as SendReceiptBody;

    if (!to || !subject || !text) {
      return new Response(JSON.stringify({ error: 'Missing to, subject, or text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [to],
        subject,
        text,
      }),
    });

    const result = await resendRes.json();

    if (!resendRes.ok) {
      return new Response(JSON.stringify({ error: result?.message ?? 'Resend request failed' }), {
        status: resendRes.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: result?.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});