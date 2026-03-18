-- Enable RLS on contact_messages
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to INSERT (public contact form)
CREATE POLICY "anon_insert_contact_messages"
  ON contact_messages FOR INSERT
  TO anon
  WITH CHECK (true);

-- No SELECT/UPDATE/DELETE for anon — messages are read
-- only via service_role in admin edge functions
