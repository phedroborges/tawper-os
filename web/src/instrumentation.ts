export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NODE_ENV !== "production" ||
    process.env.TAWPER_COMMUNICATIONS_ENABLED !== "true"
  )
    return;
  const { startCommunicationsScheduler } =
    await import("./server/communications-scheduler");
  startCommunicationsScheduler();
}
