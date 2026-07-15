const cron = require('node-cron');
const pool = require('../db');
const { sendMessage } = require('./telegram');

// Alert thresholds in days before next_service_date
const ALERT_THRESHOLDS = [
  { days: 60, type: '2months',  label: '2 months'  },
  { days: 30, type: '1month',   label: '1 month'   },
  { days: 10, type: '10days',   label: '10 days'   },
  { days: 2,  type: '2days',    label: '2 days'    },
  { days: 1,  type: '1day',     label: '1 day'     },
];

/**
 * Check all vehicles and send Telegram alerts for upcoming service dates.
 * Skips alerts already sent (deduplication via service_alert_logs).
 */
async function checkAndSendAlerts() {
  console.log(`\n🔔 [${new Date().toISOString()}] Running service alert check...`);

  try {
    // Fetch the most-recent service-type next_service_date per vehicle (across all users)
    const result = await pool.query(`
      SELECT DISTINCT ON (v.id)
        v.id AS vehicle_id,
        v.nickname,
        v.type,
        v.make,
        v.model,
        sr.next_service_date,
        sr.next_service_km
      FROM vehicles v
      JOIN service_records sr ON sr.vehicle_id = v.id
      WHERE COALESCE(sr.service_type, 'service') = 'service'
        AND sr.next_service_date IS NOT NULL
        AND sr.next_service_date >= CURRENT_DATE
      ORDER BY v.id, sr.service_date DESC
    `);

    if (result.rows.length === 0) {
      console.log('   No upcoming service dates found.');
      return;
    }

    for (const vehicle of result.rows) {
      const serviceDate = new Date(vehicle.next_service_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysRemaining = Math.round((serviceDate - today) / (1000 * 60 * 60 * 24));

      const vehicleName = [vehicle.nickname, vehicle.make, vehicle.model]
        .filter(Boolean).join(' ');

      for (const threshold of ALERT_THRESHOLDS) {
        if (daysRemaining !== threshold.days) continue;

        // Check if this exact alert was already sent
        const existing = await pool.query(
          `SELECT 1 FROM service_alert_logs
           WHERE vehicle_id = $1 AND alert_type = $2 AND alert_date = $3`,
          [vehicle.vehicle_id, threshold.type, vehicle.next_service_date]
        );

        if (existing.rows.length > 0) {
          console.log(`   ⏭️  Already sent ${threshold.type} alert for ${vehicleName}`);
          continue;
        }

        // Build the message
        const serviceDate_str = serviceDate.toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        const vehicleIcon = vehicle.type === 'bike' ? '🏍️' : '🚗';

        const message = [
          `${vehicleIcon} <b>ServiceTrack Alert</b>`,
          ``,
          `Your vehicle <b>${vehicleName}</b> is due for service in <b>${threshold.label}</b>!`,
          ``,
          `📅 Service due: <b>${serviceDate_str}</b>`,
          vehicle.next_service_km
            ? `🛣️ Next service at: <b>${Number(vehicle.next_service_km).toLocaleString()} km</b>`
            : null,
          ``,
          `🔧 Please schedule your service soon to keep your vehicle in top condition.`,
        ].filter(l => l !== null).join('\n');

        const sent = await sendMessage(message);

        if (sent) {
          // Log so we don't send again
          await pool.query(
            `INSERT INTO service_alert_logs (vehicle_id, alert_type, alert_date)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [vehicle.vehicle_id, threshold.type, vehicle.next_service_date]
          );
          console.log(`   ✅ Sent ${threshold.type} alert for ${vehicleName}`);
        }
      }
    }
    // Also run reminder alerts
    await checkAndSendReminderAlerts();
  } catch (err) {
    console.error('❌ Alert check error:', err.message);
  }
}

/**
 * Check active reminders (e.g. insurance, air filter) and send Telegram alerts.
 */
async function checkAndSendReminderAlerts() {
  console.log('🔔 Checking custom/template reminders...');
  try {
    const result = await pool.query(`
      SELECT 
        r.id AS reminder_id,
        r.reminder_type,
        r.custom_name,
        r.due_date,
        r.due_km,
        v.nickname,
        v.type AS vehicle_type,
        v.make,
        v.model
      FROM reminders r
      JOIN vehicles v ON v.id = r.vehicle_id
      WHERE r.is_active = true
        AND r.due_date IS NOT NULL
        AND r.due_date >= CURRENT_DATE
    `);

    const typeLabels = {
      insurance: 'Insurance renewal 📄',
      air_filter: 'Air filter replacement 🌬️',
      ac: 'AC filter replacement ❄️',
      wheel_alignment: 'Wheel alignment 🔧',
      spark_plug: 'Spark plug replacement ⚡',
      other: 'Spare part/Other reminder ⚙️'
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const reminder of result.rows) {
      const dueDate = new Date(reminder.due_date);
      const daysRemaining = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));

      const vehicleName = [reminder.nickname, reminder.make, reminder.model]
        .filter(Boolean).join(' ');

      const reminderLabel = reminder.reminder_type === 'other' && reminder.custom_name
        ? reminder.custom_name
        : (typeLabels[reminder.reminder_type] || 'Maintenance Task');

      for (const threshold of ALERT_THRESHOLDS) {
        if (daysRemaining !== threshold.days) continue;

        // Check if alert was already sent
        const existing = await pool.query(
          `SELECT 1 FROM reminder_alert_logs
           WHERE reminder_id = $1 AND alert_type = $2 AND alert_date = $3`,
          [reminder.reminder_id, threshold.type, reminder.due_date]
        );

        if (existing.rows.length > 0) {
          console.log(`   ⏭️  Already sent ${threshold.type} reminder alert for ${reminderLabel} on ${vehicleName}`);
          continue;
        }

        const dueDate_str = dueDate.toLocaleDateString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric'
        });
        const vehicleIcon = reminder.vehicle_type === 'bike' ? '🏍️' : '🚗';

        const message = [
          `${vehicleIcon} <b>ServiceTrack Reminder</b>`,
          ``,
          `Your vehicle <b>${vehicleName}</b> is due for:`,
          `🚨 <b>${reminderLabel}</b> in <b>${threshold.label}</b>!`,
          ``,
          `📅 Due Date: <b>${dueDate_str}</b>`,
          reminder.due_km
            ? `🛣️ Due Odometer: <b>${Number(reminder.due_km).toLocaleString()} km</b>`
            : null,
          ``,
          `⚙️ Keep your vehicle safe by maintaining it on time.`,
        ].filter(l => l !== null).join('\n');

        const sent = await sendMessage(message);

        if (sent) {
          await pool.query(
            `INSERT INTO reminder_alert_logs (reminder_id, alert_type, alert_date)
             VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
            [reminder.reminder_id, threshold.type, reminder.due_date]
          );
          console.log(`   ✅ Sent ${threshold.type} reminder alert for ${reminderLabel} on ${vehicleName}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Reminder alert check error:', err.message);
  }
}

/**
 * Start the daily cron scheduler.
 * Runs every day at 9:00 AM server local time.
 */
function startAlertScheduler() {
  console.log('📅 Service alert scheduler started (runs daily at 9:00 AM)');

  // '0 9 * * *' = every day at 09:00
  cron.schedule('0 9 * * *', () => {
    checkAndSendAlerts();
  });

  // Also run immediately on startup so you can test right away
  checkAndSendAlerts();
}

module.exports = { startAlertScheduler, checkAndSendAlerts };
