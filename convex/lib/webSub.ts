"use node";

export async function pingWebSubHub(
  hubUrl: string,
  topicUrl: string
): Promise<void> {
  const body = new URLSearchParams({
    "hub.mode": "publish",
    "hub.url": topicUrl,
    "hub.topic": topicUrl,
  });

  try {
    const response = await fetch(hubUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (response.status === 200 || response.status === 204) {
      console.log(`WebSub ping sent for ${topicUrl}`);
    } else {
      console.warn(`WebSub ping failed (non-fatal): ${response.status} for ${topicUrl}`);
    }
  } catch (err) {
    console.warn(`WebSub ping error (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }
}
