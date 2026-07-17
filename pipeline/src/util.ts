/** Hard watchdog: twice now a fetch has hung forever despite AbortSignal
 *  timeouts (Windows, near-zero CPU). Racing every batch guarantees the run
 *  keeps moving — a stalled batch fails, requeues, and is retried next run. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s (watchdog)`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
