// Release switches for the 21-day launch campaign: a module stays switched off on the site until its release day.
// To release one, set it to true, check it locally, and deploy. Nothing else needs changing.

export const RELEASED = {
  /**
   * Finance Agents (campaign day 4). While false: /agents/finance shows "Coming soon", the official agents are hidden from
   * listings, their pages are visible only to their owner, and only the owner can run jobs on them (to test before release).
   */
  financeAgents: false,
} as const;

/** Official agents are all Finance Agents for now, so they follow that switch. */
export const officialAgentsReleased = () => RELEASED.financeAgents;
