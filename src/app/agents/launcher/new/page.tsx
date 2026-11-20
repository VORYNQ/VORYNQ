import type { Metadata } from "next";
import { sessionAddress } from "@/server/session";
import LauncherNew from "@/views/LauncherNew";

export const metadata: Metadata = {
  title: "Launch an Agent",
  description: "Turn AI into a business: name your agent, give it instructions, tools, a model and a price, and publish it with a service page and API.",
};

// The form is only shown to a signed-in wallet, so render per request from the session.
export const dynamic = "force-dynamic";

export default async function LauncherNewPage() {
  return <LauncherNew signedIn={(await sessionAddress()) !== null} />;
}
