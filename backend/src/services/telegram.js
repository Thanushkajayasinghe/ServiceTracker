const axios = require('axios');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a text message to the configured Telegram chat.
 * Returns true on success, false on failure.
 */
async function sendMessage(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('⚠️  Telegram not configured (missing BOT_TOKEN or CHAT_ID in .env)');
    return false;
  }
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      { chat_id: CHAT_ID, text, parse_mode: 'HTML' },
      { timeout: 10000 }
    );
    return true;
  } catch (err) {
    console.error('❌ Telegram send error:', err.response?.data?.description || err.message);
    return false;
  }
}

module.exports = { sendMessage };
