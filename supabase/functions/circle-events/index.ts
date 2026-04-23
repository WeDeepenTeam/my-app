// Supabase Edge Function: circle-events
// Proxies Circle API to serve live events to the WeDeepen site.
// Holds CIRCLE_API_TOKEN server-side (never exposed to browser).
//
// Deploy:  supabase functions deploy circle-events --no-verify-jwt
// Public URL: https://<project-ref>.supabase.co/functions/v1/circle-events

// deno-lint-ignore-file no-explicit-any

const CIRCLE_API = "https://app.circle.so/api/admin/v2/events";
const CIRCLE_COMMUNITY_URL = "https://circle.wedeepenloveclub.com";
const PER_PAGE = 100;
// Cache for 60 seconds so repeat page loads don't hammer Circle
const CACHE_TTL_SECONDS = 60;

interface CircleEvent {
  slug: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  location_type: string;
  in_person_location: string | null;
  cover_image_url: string | null;
  body: string | null;
  confirmation_message_title: string | null;
  space?: { id: number; slug: string; name: string; community_id: number } | null;
}

// Only events in this Circle space appear on the site
const ALLOWED_SPACE_SLUG = "events-calendar";

interface NormalizedEvent {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  time: string;
  location_type: "austin" | "online";
  location_label: string;
  tag: string;
  description: string;
  image_url: string;
  url: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function pad(s: string) {
  return s;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    const h = d.getUTCHours();
    const m = d.getUTCMinutes();
    // Convert UTC to Central (UTC-5 or UTC-6). We just return UTC time here;
    // the frontend doesn't need wall-clock precision for preview cards.
    const h12 = ((h + 11) % 12) + 1;
    const ampm = h >= 12 ? "PM" : "AM";
    const mm = m.toString().padStart(2, "0");
    return `${h12}:${mm} ${ampm}`;
  } catch {
    return "";
  }
}

function toISODate(iso: string): string {
  return iso ? iso.substring(0, 10) : "";
}

async function fetchAllEvents(token: string): Promise<CircleEvent[]> {
  const all: CircleEvent[] = [];
  let page = 1;
  // Hard cap at 20 pages (2000 events) to prevent runaway
  while (page <= 20) {
    const res = await fetch(`${CIRCLE_API}?per_page=${PER_PAGE}&page=${page}`, {
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(`Circle API returned ${res.status} on page ${page}`);
    }
    const data = await res.json();
    all.push(...(data.records || []));
    if (!data.has_next_page) break;
    page++;
  }
  return all;
}

function normalize(events: CircleEvent[]): NormalizedEvent[] {
  const now = Date.now();
  const seen = new Set<string>();
  const out: NormalizedEvent[] = [];

  for (const e of events) {
    // Filter: only include events from the public events-calendar space,
    // not "Official Events" or other internal spaces
    if (!e.space || e.space.slug !== ALLOWED_SPACE_SLUG) continue;

    const starts = e.starts_at || "";
    const ends = e.ends_at || "";
    const endTime = ends ? new Date(ends).getTime() : new Date(starts).getTime();
    if (isNaN(endTime) || endTime < now) continue;

    const slug = e.slug || "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    let location_type: "austin" | "online" = "austin";
    let location_label = "Austin, TX";
    const locType = e.location_type || "";
    if (locType === "in_person") {
      location_type = "austin";
      try {
        const parsed = JSON.parse(e.in_person_location || "{}");
        location_label = parsed.formatted_address || "Austin, TX";
      } catch { /* default */ }
    } else if (locType === "virtual" || locType === "live_room") {
      location_type = "online";
      location_label = "Online";
    }

    let tag = "";
    const confTitle = (e.confirmation_message_title || "").toLowerCase();
    const name = e.name || "";
    if (confTitle.includes("member") || name.toLowerCase().includes("included")) {
      tag = "Included for Members";
    }

    const body = (e.body || "").substring(0, 200).replace(/\n/g, " ").trim();
    const startDate = toISODate(starts);
    const endDate = ends && toISODate(ends) !== startDate ? toISODate(ends) : null;

    out.push({
      id: slug,
      title: name,
      date: startDate,
      end_date: endDate,
      time: formatTime(starts),
      location_type,
      location_label,
      tag,
      description: body || name,
      image_url: e.cover_image_url || "",
      url: `${CIRCLE_COMMUNITY_URL}/c/events-calendar/${slug}`,
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = Deno.env.get("CIRCLE_API_TOKEN");
    if (!token) {
      return new Response(
        JSON.stringify({ error: "CIRCLE_API_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const raw = await fetchAllEvents(token);
    const events = normalize(raw);

    const body = {
      last_updated: new Date().toISOString(),
      source: "circle.wedeepenloveclub.com",
      event_count: events.length,
      events,
    };

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        // Browser cache for 60s, CDN cache for 300s
        "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=300, stale-while-revalidate=600`,
      },
    });
  } catch (err: any) {
    console.error("Circle events fetch failed:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
