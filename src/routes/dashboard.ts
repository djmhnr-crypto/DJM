import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'

type Bindings = { DB: D1Database }
type Variables = { user: any }

const dashboard = new Hono<{ Bindings: Bindings; Variables: Variables }>()
dashboard.use('*', authMiddleware)

dashboard.get('/stats', async (c) => {
  const user = c.get('user')

  if (user.role === 'ADMIN') {
    const [jobStats, techStats, todayJobs, weekHours] = await Promise.all([
      c.env.DB.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status='ASSIGNED' THEN 1 ELSE 0 END) as assigned,
          SUM(CASE WHEN status='IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END) as cancelled,
          SUM(CASE WHEN DATE(scheduled_start) = DATE('now') THEN 1 ELSE 0 END) as today,
          SUM(CASE WHEN DATE(scheduled_start) >= DATE('now', '-7 days') AND status='COMPLETED' THEN 1 ELSE 0 END) as week_completed
        FROM jobs
      `).first<any>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as total, SUM(CASE WHEN is_active=1 THEN 1 ELSE 0 END) as active FROM users WHERE role='TECHNICIAN'
      `).first<any>(),
      c.env.DB.prepare(`
        SELECT j.id, j.title, j.status, j.color, j.priority, j.scheduled_start, j.scheduled_end,
          c.name as client_name, u.name as technician_name, u.avatar_color
        FROM jobs j LEFT JOIN clients c ON j.client_id = c.id LEFT JOIN users u ON j.technician_id = u.id
        WHERE DATE(j.scheduled_start) = DATE('now') AND j.status != 'CANCELLED'
        ORDER BY j.scheduled_start ASC LIMIT 10
      `).all<any>(),
      c.env.DB.prepare(`
        SELECT SUM(total_minutes) as total_minutes, COUNT(*) as sessions
        FROM time_logs WHERE clock_in_time >= datetime('now', '-7 days')
      `).first<any>()
    ])

    // Recent activity
    const recentJobs = await c.env.DB.prepare(`
      SELECT j.id, j.title, j.status, j.color, j.updated_at,
        c.name as client_name, u.name as technician_name
      FROM jobs j LEFT JOIN clients c ON j.client_id = c.id LEFT JOIN users u ON j.technician_id = u.id
      ORDER BY j.updated_at DESC LIMIT 5
    `).all<any>()

    // Technician activity status
    const techActivity = await c.env.DB.prepare(`
      SELECT u.id, u.name, u.specialty, u.avatar_color,
        (SELECT tl.id FROM time_logs tl WHERE tl.technician_id = u.id AND tl.clock_out_time IS NULL LIMIT 1) as active_log_id,
        (SELECT j.title FROM time_logs tl JOIN jobs j ON tl.job_id = j.id WHERE tl.technician_id = u.id AND tl.clock_out_time IS NULL LIMIT 1) as current_job,
        (SELECT j.color FROM time_logs tl JOIN jobs j ON tl.job_id = j.id WHERE tl.technician_id = u.id AND tl.clock_out_time IS NULL LIMIT 1) as current_job_color
      FROM users u WHERE u.role = 'TECHNICIAN' AND u.is_active = 1 ORDER BY u.name ASC
    `).all<any>()

    return c.json({
      jobs: jobStats,
      technicians: techStats,
      todayJobs: todayJobs.results,
      weekHours: { totalMinutes: weekHours?.total_minutes || 0, sessions: weekHours?.sessions || 0 },
      recentActivity: recentJobs.results,
      techActivity: techActivity.results
    })
  } else {
    // Technician dashboard
    const [myJobs, activeLog, weekStats] = await Promise.all([
      c.env.DB.prepare(`
        SELECT j.*, c.name as client_name, c.phone as client_phone, c.address as client_address
        FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
        WHERE j.technician_id = ? AND j.status NOT IN ('COMPLETED','CANCELLED')
        ORDER BY j.scheduled_start ASC LIMIT 20
      `).bind(user.userId).all<any>(),
      c.env.DB.prepare(`
        SELECT tl.*, j.title as job_title, j.color, j.id as job_id,
          c.name as client_name, c.address as client_address
        FROM time_logs tl JOIN jobs j ON tl.job_id = j.id LEFT JOIN clients c ON j.client_id = c.id
        WHERE tl.technician_id = ? AND tl.clock_out_time IS NULL
      `).bind(user.userId).first<any>(),
      c.env.DB.prepare(`
        SELECT COUNT(*) as jobs_completed, SUM(total_minutes) as total_minutes
        FROM time_logs WHERE technician_id = ? AND clock_in_time >= datetime('now', '-7 days')
      `).bind(user.userId).first<any>()
    ])

    return c.json({
      upcomingJobs: myJobs.results,
      activeLog,
      weekStats
    })
  }
})

export default dashboard
