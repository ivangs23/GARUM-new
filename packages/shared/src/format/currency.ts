const formatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatEUR(amount: number): string {
  // Defensa: NaN llega cuando una fila vacía pasa por Number() o cuando
  // un campo numeric NULL se proyecta como NaN tras un parse. Devolvemos
  // "0,00 €" para que la UI no muestre "NaN €", que es peor que un cero
  // visible. Lo mismo aplica a infinity (división por cero accidental).
  if (!Number.isFinite(amount)) return formatter.format(0);
  return formatter.format(amount);
}
