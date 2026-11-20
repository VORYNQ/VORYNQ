import type { Metadata } from "next";
import { franchises } from "@/server/db";
import { sessionAddress } from "@/server/session";
import Franchise from "@/views/Franchise";

export const metadata: Metadata = {
  title: "Agent Franchise",
  description: "Run a proven AI agent under your own name and price. The creator's know-how stays private; every job is split between creator, operator and VORYNQ.",
};

// Lists change with every new franchise, and "your franchises" depends on the session.
export const dynamic = "force-dynamic";

export default async function FranchisePage({ searchParams }: PageProps<"/agents/launcher/franchise">) {
  const me = await sessionAddress();
  const [list, mine] = await Promise.all([franchises.open(100), me ? franchises.ofOperator(me) : null]);
  // ?agent=slug (from an agent's "Open a franchise" link) opens that agent's form.
  const agent = (await searchParams).agent;
  return <Franchise agents={list} mine={mine} me={me} initialAgent={typeof agent === "string" ? agent : null} />;
}
