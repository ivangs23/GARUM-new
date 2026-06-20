/**
 * Envío de alertas operativas por Telegram. Server-only.
 *
 * Configuración (env del servidor, p.ej. en Vercel):
 *   TELEGRAM_BOT_TOKEN  → token del bot (crear con @BotFather)
 *   TELEGRAM_CHAT_ID    → id del chat/grupo destino (obtener con @userinfobot
 *                         o getUpdates tras escribir al bot)
 *
 * Si falta cualquiera de los dos, NO se envía nada (no rompe): se registra un
 * warning para que se vea en los logs. Así el comprobador de alertas funciona
 * aunque Telegram aún no esté configurado (devuelve el resumen por JSON).
 */
export async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('[alerts] Telegram no configurado; alerta NO enviada:', text);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      console.error('[alerts] Telegram respondió', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[alerts] Telegram fetch falló:', e);
    return false;
  }
}
