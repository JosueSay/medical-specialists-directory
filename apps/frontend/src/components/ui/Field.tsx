import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { cn } from '@/utils/cn';

const CONTROL_CLASSES =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-content placeholder:text-content-muted transition disabled:opacity-50';

function Label({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-content-muted mb-1.5 block text-xs font-medium">
      {children}
    </label>
  );
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

/** Campo de texto con etiqueta asociada por id (requisito de accesibilidad). */
export function TextField({ label, className, id, ...props }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <input id={fieldId} className={cn(CONTROL_CLASSES, className)} {...props} />
    </div>
  );
}

export interface SelectFieldOption {
  value: string;
  label: string;
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectFieldOption[];
}

export function SelectField({ label, options, className, id, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <select id={fieldId} className={cn(CONTROL_CLASSES, className)} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
