export type ShareResult = "shared" | "copied" | "cancelled" | "manual";

export async function shareTicketLink(ticketId: string, title: string): Promise<ShareResult> {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const url = new URL(`tickets/${encodeURIComponent(ticketId)}/`, baseUrl).toString();
  const shareData = {
    title,
    text: `Angalia mkeka huu kwenye Wazee wa Betting TZ: ${title}`,
    url,
  };

  if (typeof navigator.share === "function") {
    try {
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      // If the platform share sheet is unavailable, fall through to copying the link.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    window.prompt("Nakili link ya mkeka ili kuishiriki:", url);
    return "manual";
  }
}
