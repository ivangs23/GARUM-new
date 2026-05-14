/**
 * Lee y valida una variable de entorno requerida. Lanza al cargar el módulo
 * si falta, en lugar de explotar en mitad de un flujo de pago con un mensaje
 * críptico ("secret cannot be empty"). Solo para uso en server-only routes;
 * no la importes en client components o el bundle del navegador filtraría
 * los nombres de secretos.
 */
export function requireServerEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}
