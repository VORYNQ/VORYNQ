import { waitlist } from "@/server/db";
import { clientIp, fail, readJson } from "@/server/http";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// New sign-ups per address per hour, so the list cannot be flooded from one place.
const PER_IP_HOUR = 5;

// Adds an email to the launch-update list from the footer form (BUILD_PLAN F1.4).
// There is no page to read the list: open the waitlist table in the Supabase dashboard.
export async function POST(req: Request) {
  const body = await readJson(req, 2048);
  if (body === "too_large") return fail(413, "Request body too large.");
  if (!body) return fail(400, "Send a JSON body with your email.");
  // A hidden field people never fill in; bots often do. Pretend it worked.
  if (typeof body.website === "string" && body.website) return Response.json({ ok: true });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) return fail(400, "Please enter a valid email address.", { email: "Enter a valid email." });

  const ip = clientIp(req);
  if ((await waitlist.countByIpSince(ip, new Date(Date.now() - 3_600_000).toISOString())) >= PER_IP_HOUR)
    return fail(429, "Too many sign-ups from this address. Please try again later.");
  // The same reply whether or not the email was already listed, so the form does not reveal who signed up.
  await waitlist.add(email, ip);
  return Response.json({ ok: true });
}
