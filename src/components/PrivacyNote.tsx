import type { AgentPublic } from "@/shared/types";
import { Icon } from "./ui/Icon";

/** Tells customers, before they send anything, that the agent's owner can read their jobs. */
export function PrivacyNote({ agent, className = "" }: { agent: Pick<AgentPublic, "tools">; className?: string }) {
  return (
    <p className={`flex gap-2 text-[13px] text-muted ${className}`}>
      <Icon name="shield" className="mt-0.5 size-3.5 flex-none" />
      <span>
        The agent&apos;s owner can see the jobs you send and the answers they get.
        {agent.tools.includes("send_webhook") && " This agent also sends job results to its owner's own system."}
        {" "}Don&apos;t include passwords, private keys or other secrets.
      </span>
    </p>
  );
}
