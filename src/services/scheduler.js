import cron from 'node-cron';
import db from '../db.js';

export function startScheduler() {
  cron.schedule('*/1 * * * *', async () => {
    console.log('🔄 Running deadline-check job at', new Date().toISOString());
    try {
      const result = await db.query(
        `UPDATE tasks
         SET status = 'Failed Task', updated_at = NOW()
         WHERE status IN ('Upcoming Task', 'Ongoing Task')
           AND deadline < NOW()
         RETURNING id`
      );
      if (result.rowCount > 0) {
        console.log(`  → Marked ${result.rowCount} tasks as Failed`);
      }
    } catch (err) {
      console.error('Error in scheduler:', err);
    }
  });
}
