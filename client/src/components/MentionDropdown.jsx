import { useEffect, useRef, useCallback } from 'react';
import { User as UserIcon } from 'lucide-react';

export default function MentionDropdown({
  participants,
  query,
  onSelect,
  visible,
  onDismiss,
}) {
  const listRef = useRef(null);
  const highlightedIndexRef = useRef(-1);

  const filtered = participants.filter(
    (p) => p.name.toLowerCase().includes(query.toLowerCase()) && p.socketId !== query
  );

  useEffect(() => {
    highlightedIndexRef.current = 0;
  }, [query, visible]);

  const handleKeyDown = useCallback((e) => {
    if (!visible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onDismiss();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightedIndexRef.current = Math.min(
        highlightedIndexRef.current + 1,
        filtered.length - 1
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightedIndexRef.current = Math.max(highlightedIndexRef.current - 1, 0);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[highlightedIndexRef.current];
      if (item) {
        onSelect(item.name);
        onDismiss();
      }
      return;
    }
  }, [visible, filtered, onSelect, onDismiss]);

  useEffect(() => {
    if (!visible) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, handleKeyDown]);

  if (!visible || !query || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      className="absolute z-50 mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
    >
      {filtered.map((participant, index) => {
        const active = index === highlightedIndexRef.current;
        return (
          <div
            key={participant.socketId}
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(participant.name);
              onDismiss();
            }}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer text-sm transition-colors ${
              active
                ? 'bg-blue-600/30 text-blue-200'
                : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <UserIcon className="w-4 h-4 text-slate-500" />
            <span className="truncate">{participant.name}</span>
          </div>
        );
      })}
    </div>
  );
}
