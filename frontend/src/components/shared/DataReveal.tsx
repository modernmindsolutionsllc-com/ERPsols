import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface DataRevealProps {
  value: string;
  isSensitive: boolean;
  maskChar?: string;
  maskLength?: number;
}

export function DataReveal({ value, isSensitive, maskChar = '•', maskLength = 8 }: DataRevealProps) {
  const [revealed, setRevealed] = useState(false);
  const [flash, setFlash] = useState(false);

  if (!isSensitive) {
    return <span className="font-mono text-sm text-[#0F172A] dark:text-slate-100">{value}</span>;
  }

  const masked = maskChar.repeat(maskLength);

  const handleToggle = () => {
    if (!revealed) {
      setRevealed(true);
      setFlash(true);
      setTimeout(() => setFlash(false), 400);
      toast.info('Sensitive data revealed — action logged to audit trail');
    } else {
      setRevealed(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`font-mono text-sm transition-all duration-200 ${
          revealed ? 'text-[#0F172A] dark:text-slate-100 tracking-normal' : 'text-[#94A3B8] dark:text-slate-500 tracking-[0.08em]'
        }`}
        style={{
          backgroundColor: flash ? 'rgba(15, 110, 86, 0.15)' : 'transparent',
          transition: 'background-color 400ms ease'
        }}
      >
        {revealed ? value : masked}
      </span>
      <button
        onClick={handleToggle}
        className="p-1 rounded hover:bg-[rgba(24,95,165,0.06)] dark:hover:bg-white/5 text-[#64748B] dark:text-slate-400 hover:text-[#185FA5] transition-colors"
        title={revealed ? 'Hide sensitive data' : 'Reveal sensitive data'}
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}
