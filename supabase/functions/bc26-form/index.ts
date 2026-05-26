// Supabase Edge Function: bc26-form
// Receives form submissions from wedeepen.com/bc26 (Beyond Biohacking
// Conference campaign landing page). Creates a Circle community member
// and applies tags so a Circle Workflow can fire the welcome email.
//
// Deploy:  supabase functions deploy bc26-form --no-verify-jwt
// Public URL: https://<project-ref>.supabase.co/functions/v1/bc26-form
//
// Expected POST payload (JSON):
//   {
//     "timestamp":   "2026-05-23T19:00:00Z",
//     "source":      "bc26",
//     "name":        "Alex Rivera",
//     "email":       "alex@example.com",
//     "city":        "Austin",
//     "phone":       "+15125551234",
//     "sms_consent": "Y" | "N",
//     "partial":     "Y" | "N",
//     "referrer":    "https://...",
//     "user_agent":  "Mozilla/..."
//   }
//
// Tags applied in Circle (Christina's workflows listen for these):
//   - "bc26"               — every submission
//   - "bc26-welcome-email" — full submissions only; triggers Circle workflow
//                            that sends Christina's welcome email
//   - "bc26-partial"       — step-1-only submissions (no SMS consent / no phone);
//                            do NOT include in welcome email blast
//   - "sms-consent"        — when sms_consent === "Y"

// deno-lint-ignore-file no-explicit-any

const CIRCLE_API_BASE = "https://app.circle.so/api/admin/v2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Circle API helpers ─────────────────────────────────────────────

interface CircleMember {
  id?: number;
  email?: string;
  name?: string;
  [k: string]: any;
}

async function createOrFetchCircleMember(token: string, name: string, email: string): Promise<{
  ok: boolean;
  status: number;
  member: CircleMember | null;
  created: boolean;
  raw: any;
}> {
  // Create the member. Circle returns 422 with the existing member if email is
  // already in the community — we treat that as success and re-tag the existing
  // record so repeat-scanners (e.g. someone who scanned the QR twice) still flow
  // through the right Circle workflow.
  const createRes = await fetch(`${CIRCLE_API_BASE}/community_members`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      email,
      skip_invitation: true, // suppress Circle's default welcome — we control via workflow
    }),
  });
  const createData = await createRes.json().catch(() => ({}));

  if (createRes.ok) {
    return { ok: true, status: createRes.status, member: createData, created: true, raw: createData };
  }

  // Likely 422 duplicate — fetch the existing member by email so we can still tag.
  const lookupRes = await fetch(
    `${CIRCLE_API_BASE}/community_members/search?email=${encodeURIComponent(email)}`,
    {
      method: "GET",
      headers: { "Authorization": `Token ${token}` },
    }
  );
  const lookupData = await lookupRes.json().catch(() => ({}));

  // The search endpoint returns either an object or a paginated list depending on
  // the Circle deployment; normalize both shapes.
  const existing: CircleMember | null = Array.isArray(lookupData?.records)
    ? lookupData.records[0]
    : (Array.isArray(lookupData) ? lookupData[0] : (lookupData?.id ? lookupData : null));

  return {
    ok: lookupRes.ok && !!existing,
    status: createRes.status,
    member: existing,
    created: false,
    raw: { create: createData, lookup: lookupData },
  };
}

async function applyTagToMember(token: string, memberId: number, tagName: string): Promise<{
  ok: boolean;
  status: number;
}> {
  // POST /community_members/:id/community_member_tags  { name: "<tag>" }
  const res = await fetch(
    `${CIRCLE_API_BASE}/community_members/${memberId}/community_member_tags`,
    {
      method: "POST",
      headers: {
        "Authorization": `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: tagName }),
    }
  );
  return { ok: res.ok, status: res.status };
}

// ─── Validation helpers ─────────────────────────────────────────────

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

function clampStr(v: any, max: number): string {
  return String(v || "").trim().slice(0, max);
}

// ─── Handler ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("CIRCLE_API_TOKEN");
    if (!token) {
      console.error("bc26-form: CIRCLE_API_TOKEN env var not set");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // The bc26 page POSTs as text/plain (avoids CORS preflight in some browsers),
    // so parse the body regardless of declared content-type.
    const rawBody = await req.text();
    let body: any = {};
    try { body = JSON.parse(rawBody); } catch { body = {}; }

    const name        = clampStr(body.name, 200);
    const email       = clampStr(body.email, 320).toLowerCase();
    const city        = clampStr(body.city, 120);
    const phone       = clampStr(body.phone, 50);
    const smsConsent  = clampStr(body.sms_consent, 4).toUpperCase() === "Y";
    const isPartial   = clampStr(body.partial, 4).toUpperCase() === "Y";
    const source      = clampStr(body.source, 50) || "bc26";

    // Minimum required fields (name + valid email).
    if (!name || !isValidEmail(email)) {
      return new Response(
        JSON.stringify({ error: "Name and valid email are required." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create / fetch the Circle member.
    const memberResult = await createOrFetchCircleMember(token, name, email);
    const memberId = memberResult.member?.id;

    if (!memberId) {
      // Couldn't create AND couldn't find — log and return 200 anyway so the
      // visitor sees success. We'll inspect the log to recover the lead.
      console.error("bc26-form: no member id available, cannot tag", {
        email,
        create_status: memberResult.status,
        raw: memberResult.raw,
      });
      return new Response(
        JSON.stringify({ ok: true, warning: "member_creation_failed_silent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Apply tags. Build the tag list based on the submission state.
    //    Christina configures Circle Workflows to fire on "bc26-welcome-email".
    const tags = ["bc26", `bc26-${source}`];
    if (isPartial) {
      tags.push("bc26-partial");
    } else {
      tags.push("bc26-welcome-email"); // triggers Circle workflow → welcome email
    }
    if (smsConsent) {
      tags.push("sms-consent");
    }
    // Dedupe.
    const uniqueTags = Array.from(new Set(tags));

    const tagResults: Array<{ tag: string; ok: boolean; status: number }> = [];
    for (const tag of uniqueTags) {
      const r = await applyTagToMember(token, memberId, tag);
      tagResults.push({ tag, ok: r.ok, status: r.status });
    }

    console.log("bc26-form submission:", {
      email,
      member_id: memberId,
      created: memberResult.created,
      city,
      phone_provided: phone.length > 0,
      sms_consent: smsConsent,
      is_partial: isPartial,
      tags_applied: tagResults,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        member_id: memberId,
        created: memberResult.created,
        tags: uniqueTags,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("bc26-form failed:", err);
    // Return success to the user so we don't break the form UX, but log the
    // error for Christina to inspect. (The Apps Script Sheet endpoint catches
    // any leads we lose here as a backup.)
    return new Response(
      JSON.stringify({ ok: true, warning: "internal_error_silent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
