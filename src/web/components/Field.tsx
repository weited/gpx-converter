import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Radix Select reserves '' for "no value", so map our '' (= auto) to a sentinel. */
const EMPTY = '__empty__';

export interface Choice<T extends string> {
  value: T;
  label: string;
}

interface SelectFieldProps<T extends string> {
  label: string;
  hint?: ReactNode;
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function SelectField<T extends string>({ label, hint, value, options, onChange, className }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value === '' ? EMPTY : value} onValueChange={(v) => onChange((v === EMPTY ? '' : v) as T)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value === '' ? EMPTY : o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
