import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

const CONTROL_CLASSES = [
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm',
  'text-content placeholder:text-content-muted transition',
  // El anillo se dibuja con la misma marca que los botones para que el foco se
  // vea igual en todo el formulario, en lugar del contorno azul del navegador
  'focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:outline-none',
  'disabled:opacity-50',
].join(' ');

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

/**
 * Selector con la flecha propia del proyecto.
 *
 * La flecha nativa del navegador no se puede estilizar, y cada sistema dibuja
 * una distinta: se oculta con `appearance-none` y se pinta un icono encima. El
 * icono lleva `pointer-events-none` para que el clic siga llegando al `select`
 * y el desplegable se abra al pulsar sobre ella.
 *
 * Lo que queda fuera de alcance es la lista desplegada: sus `option` las dibuja
 * el sistema operativo y no aceptan estilos. Igualarla exigiria un componente
 * propio con su navegacion por teclado y su accesibilidad, que es mucho mas de
 * lo que este formulario necesita.
 */
export function SelectField({ label, options, className, id, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <select
          id={fieldId}
          className={cn(CONTROL_CLASSES, 'cursor-pointer appearance-none pr-9', className)}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="text-content-muted pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        />
      </div>
    </div>
  );
}
