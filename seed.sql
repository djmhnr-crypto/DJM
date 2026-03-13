-- Seed Data for FieldVibe Dispatch App
-- Password for all users is: password123 (bcrypt hash equivalent using SHA-256 for Workers)

INSERT OR IGNORE INTO users (id, email, password_hash, name, phone, role, specialty, avatar_color) VALUES
  ('admin-001', 'admin@fieldvibe.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Sarah Johnson', '555-0100', 'ADMIN', 'Management', '#8B5CF6'),
  ('admin-002', 'dispatcher@fieldvibe.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Mike Chen', '555-0101', 'ADMIN', 'Dispatch', '#EC4899'),
  ('tech-001', 'john.smith@fieldvibe.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'John Smith', '555-0102', 'TECHNICIAN', 'HVAC', '#3B82F6'),
  ('tech-002', 'emily.davis@fieldvibe.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Emily Davis', '555-0103', 'TECHNICIAN', 'Electrical', '#10B981'),
  ('tech-003', 'carlos.ruiz@fieldvibe.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Carlos Ruiz', '555-0104', 'TECHNICIAN', 'Plumbing', '#F59E0B'),
  ('tech-004', 'linda.park@fieldvibe.com', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'Linda Park', '555-0105', 'TECHNICIAN', 'HVAC', '#EF4444');

INSERT OR IGNORE INTO clients (id, name, phone, email, address, notes) VALUES
  ('client-001', 'Acme Corporation', '555-1001', 'facilities@acme.com', '123 Business Park Dr, Suite 100', 'Key account - priority service'),
  ('client-002', 'Green Valley Homes', '555-1002', 'mgmt@greenvalley.com', '456 Residential Ave', 'Residential complex - 50 units'),
  ('client-003', 'Metro Office Center', '555-1003', 'ops@metrooffice.com', '789 Downtown Blvd, Floor 3', 'Commercial building'),
  ('client-004', 'Sunrise Restaurant', '555-1004', 'owner@sunrise.com', '321 Main Street', 'Restaurant - urgent response needed'),
  ('client-005', 'City Hospital', '555-1005', 'facilities@cityhospital.org', '100 Medical Center Way', 'CRITICAL - 24/7 support required'),
  ('client-006', 'Tech Startup Hub', '555-1006', 'ops@techhub.com', '555 Innovation Drive', 'Multiple suites - check in at lobby');

INSERT OR IGNORE INTO jobs (id, title, description, location_address, client_id, technician_id, created_by, scheduled_start, scheduled_end, status, color, priority, service_type) VALUES
  ('job-001', 'AC Unit Maintenance', 'Annual maintenance check for rooftop AC units', '123 Business Park Dr', 'client-001', 'tech-001', 'admin-001', datetime('now', '-1 day', '+8 hours'), datetime('now', '-1 day', '+10 hours'), 'COMPLETED', '#10B981', 'NORMAL', 'HVAC'),
  ('job-002', 'Emergency Electrical Repair', 'Circuit breaker tripping in server room', '100 Medical Center Way', 'client-005', 'tech-002', 'admin-001', datetime('now', '+2 hours'), datetime('now', '+4 hours'), 'ASSIGNED', '#EF4444', 'URGENT', 'Electrical'),
  ('job-003', 'Plumbing Inspection', 'Monthly plumbing inspection for residential complex', '456 Residential Ave', 'client-002', 'tech-003', 'admin-001', datetime('now', '+1 day', '+9 hours'), datetime('now', '+1 day', '+11 hours'), 'ASSIGNED', '#3B82F6', 'NORMAL', 'Plumbing'),
  ('job-004', 'HVAC Filter Replacement', 'Quarterly filter replacement - all 12 units', '789 Downtown Blvd', 'client-003', 'tech-004', 'admin-002', datetime('now', '+1 day', '+13 hours'), datetime('now', '+1 day', '+15 hours'), 'ASSIGNED', '#F59E0B', 'NORMAL', 'HVAC'),
  ('job-005', 'Kitchen Hood Inspection', 'Fire suppression and hood inspection', '321 Main Street', 'client-004', 'tech-001', 'admin-001', datetime('now', '+2 days', '+10 hours'), datetime('now', '+2 days', '+12 hours'), 'ASSIGNED', '#8B5CF6', 'HIGH', 'Inspection'),
  ('job-006', 'Network Cabling', 'Install structured cabling for new office expansion', '555 Innovation Drive', 'client-006', 'tech-002', 'admin-002', datetime('now', '+3 days', '+8 hours'), datetime('now', '+3 days', '+12 hours'), 'ASSIGNED', '#06B6D4', 'NORMAL', 'Electrical'),
  ('job-007', 'Boiler Service', 'Annual boiler inspection and maintenance', '456 Residential Ave', 'client-002', 'tech-003', 'admin-001', datetime('now', '+3 days', '+14 hours'), datetime('now', '+3 days', '+16 hours'), 'ASSIGNED', '#F59E0B', 'NORMAL', 'Plumbing'),
  ('job-008', 'Emergency AC Repair', 'AC not cooling - tenant complaint', '100 Medical Center Way', 'client-005', 'tech-001', 'admin-001', datetime('now', '+4 days', '+7 hours'), datetime('now', '+4 days', '+9 hours'), 'ASSIGNED', '#EF4444', 'URGENT', 'HVAC');

INSERT OR IGNORE INTO time_logs (id, job_id, technician_id, clock_in_time, clock_out_time, total_minutes, notes) VALUES
  ('tl-001', 'job-001', 'tech-001', datetime('now', '-1 day', '+8 hours'), datetime('now', '-1 day', '+10 hours', '+15 minutes'), 135, 'All units serviced. Replaced 2 filters. System running optimally.');

INSERT OR IGNORE INTO notifications (id, user_id, job_id, type, title, message, is_read) VALUES
  ('notif-001', 'tech-001', 'job-002', 'JOB_ASSIGNED', 'New Job Assigned', 'You have been assigned to Emergency Electrical Repair at City Hospital', 0),
  ('notif-002', 'tech-002', 'job-002', 'JOB_ASSIGNED', 'New Job Assigned', 'Emergency Electrical Repair - City Hospital. Starts in 2 hours!', 0),
  ('notif-003', 'admin-001', 'job-001', 'JOB_COMPLETED', 'Job Completed', 'John Smith completed AC Unit Maintenance at Acme Corporation', 1);
