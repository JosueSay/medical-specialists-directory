import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Une clases condicionales y resuelve conflictos de Tailwind.
 *
 * `clsx` arma la cadena; `twMerge` descarta las clases que compiten entre si y
 * conserva la ultima. Sin ese segundo paso, `<Button className="h-12">`
 * produciria `h-10 h-12` y ganaria la que aparezca despues en el CSS generado,
 * no la que se paso por props: el componente dejaria de ser ajustable de forma
 * predecible.
 */
export function cn(...values: ClassValue[]): string {
  return twMerge(clsx(values));
}
