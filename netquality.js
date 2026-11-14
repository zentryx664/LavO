/** Extract the numbers we care about from an RTCStatsReport (any Map-like with forEach). */
export function parseStats(report) {
  let rtt = null;
  let jitter = null;
  let lost = 0;
  let received = 0;
  report.forEach((s) => {
    if (s.type === 'candidate-pair' && typeof s.currentRoundTripTime === 'number') {
      if (s.nominated || s.state === 'succeeded') rtt = s.currentRoundTripTime * 1000;
    } else if (s.type === 'inbound-rtp' && (s.kind === 'audio' || s.mediaType === 'audio')) {
      if (typeof s.jitter === 'number') jitter = s.jitter * 1000;
      lost += Math.max(0, s.packetsLost || 0);
      received += s.packetsReceived || 0;
    }
  });
  return { rtt, jitter, lost, received };
}

/** Packet loss % over the interval between two samples (or since start if no previous). */
export function lossPercent(prev, curr) {
  const dl = prev ? Math.max(0, curr.lost - prev.lost) : curr.lost;
  const dr = prev ? Math.max(0, curr.received - prev.received) : curr.received;
  const total = dl + dr;
  return total > 0 ? (dl / total) * 100 : 0;
}

/** Worst case across all peers. rtt stays null if nobody reported one. */
export function aggregate(samples) {
  const out = { rtt: null, jitter: null, loss: 0 };
  for (const s of samples) {
    if (s.rtt != null) out.rtt = Math.max(out.rtt ?? 0, s.rtt);
    if (s.jitter != null) out.jitter = Math.max(out.jitter ?? 0, s.jitter);
    out.loss = Math.max(out.loss, s.loss || 0);
  }
  return out;
}

export function quality({ rtt, jitter, loss }) {
  if (rtt == null) return 'unknown';
  const j = jitter ?? 0;
  if (rtt > 200 || j > 50 || loss > 8) return 'poor';
  if (rtt > 100 || j > 30 || loss > 3) return 'fair';
  return 'good';
}
