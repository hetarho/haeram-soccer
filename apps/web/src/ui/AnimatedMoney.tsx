import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './motion';

/** Counts minor units toward a new amount and flashes the direction of the change. */
export function AnimatedMoney({
  value,
  format,
  className,
  upClass,
  downClass,
}: {
  value: string;
  format: (value: string) => string;
  className?: string;
  upClass?: string;
  downClass?: string;
}) {
  const [shown, setShown] = useState(value);
  const [trend, setTrend] = useState<'up' | 'down'>();
  const from = useRef(value);
  useEffect(() => {
    const start = BigInt(from.current),
      end = BigInt(value);
    from.current = value;
    if (start === end) return;
    setTrend(end > start ? 'up' : 'down');
    const clear = window.setTimeout(() => setTrend(undefined), 900);
    if (reducedMotion()) {
      setShown(value);
      return () => window.clearTimeout(clear);
    }
    const began = performance.now(),
      duration = 600;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration),
        eased = 1 - (1 - t) ** 3;
      setShown((start + ((end - start) * BigInt(Math.round(eased * 1000))) / 1000n).toString());
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(clear);
      setShown(value);
    };
  }, [value]);
  return (
    <b
      className={`${className || ''} ${trend === 'up' ? upClass || '' : trend === 'down' ? downClass || '' : ''}`}
    >
      {format(shown)}
    </b>
  );
}
