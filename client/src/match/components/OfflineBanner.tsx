import { useOfflineStatus } from '../lib/sw';

/**
 * Sticky bottom banner that shows offline state and queue size on tablet UIs.
 * Hides when online and queue is empty.
 */
export default function OfflineBanner() {
  const { online, queueSize } = useOfflineStatus();
  if (online && queueSize === 0) return null;

  return (
    <div className={`fixed bottom-2 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-sm font-medium shadow-lg ${
      online ? 'bg-blue-600 text-white' : 'bg-red-600 text-white animate-pulse'
    }`}>
      {!online && (queueSize === 0 ? '● OFFLINE' : `● OFFLINE — ${queueSize} queued`)}
      {online && queueSize > 0 && `Syncing ${queueSize}…`}
    </div>
  );
}
