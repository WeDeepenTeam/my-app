/**
 * Create KASHF Checkout Session
 *
 * Creates a Stripe Checkout Session for KASHF event ticket tiers.
 * Returns the checkout URL for client-side redirect.
 *
 * Deploy with: supabase functions deploy create-kashf-checkout
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

interface TierConfig {
  name: string;
  price: number;       // cents
  description: string;
  limit?: number;
}

const TIERS: Record<string, TierConfig> = {
  witness: {
    name: 'KASHF — The Witness',
    price: 150000,
    description: 'Entry to the 7-hour ceremony (7pm–2am), full immersion, welcome elixir, ceremonial opening, overnight stay with morning closing ceremony.'
  },
  devotion: {
    name: 'KASHF — The Devotion',
    price: 250000,
    description: 'Everything in The Witness + curated devotional gift package, reserved sanctuary seating, anointing & devotional touch blessing, 30-min post-event integration session via Zoom.'
  },
  sanctum: {
    name: 'KASHF — The Inner Sanctum',
    price: 500000,
    description: 'Everything in The Devotion + custom poem/song transmission, live devotional performance, recorded audio gift, premium seating, 8-hand touch activation, sacred holding, sacred adornment ritual, two expanded integration sessions.',
    limit: 4
  }
};

interface StripeConfig {
  secret_key: string | null;
  sandbox_secret_key: string | null;
  is_active: boolean;
  test_mode: boolean;
}

function formEncode(obj: Record<string, string | number | boolean>): string {
  return Object.entries(obj)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tier, success_url, cancel_url } = await req.json();

    // Validate tier
    const tierConfig = TIERS[tier];
    if (!tierConfig) {
      return new Response(JSON.stringify({ error: 'Invalid tier' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load Stripe config from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceRoleKey);

    const { data: config, error: configErr } = await sb
      .from('stripe_config')
      .select('secret_key, sandbox_secret_key, is_active, test_mode')
      .single();

    if (configErr || !config) {
      console.error('Stripe config error:', configErr);
      return new Response(JSON.stringify({ error: 'Payment system unavailable' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const stripeConfig = config as StripeConfig;
    const secretKey = stripeConfig.test_mode
      ? stripeConfig.sandbox_secret_key
      : stripeConfig.secret_key;

    if (!secretKey) {
      return new Response(JSON.stringify({ error: 'Payment system not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create Stripe Checkout Session via API
    const params: Record<string, string | number | boolean> = {
      'mode': 'payment',
      'success_url': success_url || 'https://example.com/success',
      'cancel_url': cancel_url || 'https://example.com/cancel',
      'line_items[0][price_data][currency]': 'usd',
      'line_items[0][price_data][product_data][name]': tierConfig.name,
      'line_items[0][price_data][product_data][description]': tierConfig.description,
      'line_items[0][price_data][unit_amount]': tierConfig.price,
      'line_items[0][quantity]': 1,
      'payment_method_types[0]': 'card',
      'metadata[event]': 'kashf_eden_exposed',
      'metadata[tier]': tier,
      'customer_creation': 'always',
      'payment_intent_data[metadata][event]': 'kashf_eden_exposed',
      'payment_intent_data[metadata][tier]': tier,
    };

    // Collect email for sending ceremony details
    params['customer_email'] = '';  // Let Stripe collect it
    // Actually, to collect email, we use the billing_address_collection or just let it be entered
    // Remove the empty email and just let checkout collect it automatically

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formEncode(params)
    });

    const text = await response.text();
    if (!response.ok) {
      const err = JSON.parse(text);
      console.error('Stripe error:', err);
      return new Response(JSON.stringify({ error: err?.error?.message || 'Payment creation failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const session = JSON.parse(text);

    // Log API usage
    try {
      await sb.from('api_usage_log').insert({
        service: 'stripe',
        endpoint: 'checkout_sessions',
        metadata: { tier, session_id: session.id, amount: tierConfig.price }
      });
    } catch (logErr) {
      console.warn('API log failed (non-critical):', logErr);
    }

    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
