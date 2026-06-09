import { useCallback, useState } from 'react';

/**
 * Quản lý 1 stack `Step` cho state machine của mode.
 *
 *  - `setStep(next)`     → set không push history (dùng cho auto-transition trong useEffect).
 *  - `go(next)`          → push step hiện tại lên history rồi chuyển sang `next` (forward do user nhấn).
 *  - `back()`            → pop history, quay lại step gần nhất.
 *  - `canBack`           → true khi history có ít nhất 1 item.
 *
 * Dùng `historyKey` để re-render khi cần (tránh stale closure).
 */
export function useStepNav<Step>(initial: Step) {
  const [step, setStep] = useState<Step>(initial);
  const [history, setHistory] = useState<Step[]>([]);

  const go = useCallback((next: Step) => {
    setStep((prev) => {
      setHistory((h) => [...h, prev]);
      return next;
    });
  }, []);

  const back = useCallback((): boolean => {
    let popped = false;
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1]!;
      setStep(prev);
      popped = true;
      return h.slice(0, -1);
    });
    return popped;
  }, []);

  return {
    step,
    setStep,
    go,
    back,
    canBack: history.length > 0,
  };
}
