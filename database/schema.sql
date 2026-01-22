-- =============================================
-- Voice Capture API - Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- Table: projects
-- =============================================
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    public_key VARCHAR(50) NOT NULL UNIQUE,
    language VARCHAR(5) DEFAULT 'es',
    transcription_mode VARCHAR(20) DEFAULT 'realtime'
        CHECK (transcription_mode IN ('realtime', 'batch')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    settings JSONB DEFAULT '{}'::jsonb
);

-- Index for public_key lookup (used by widget)
CREATE INDEX IF NOT EXISTS idx_projects_public_key ON projects(public_key);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects" ON projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
    FOR DELETE USING (auth.uid() = user_id);

-- =============================================
-- Table: transcription_batches
-- IMPORTANT: Create BEFORE recordings due to FK reference
-- =============================================
CREATE TABLE IF NOT EXISTS transcription_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    status VARCHAR(30) DEFAULT 'pending_confirmation'
        CHECK (status IN ('pending_confirmation', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
    total_recordings INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    estimated_cost_usd DECIMAL(10,4),
    actual_cost_usd DECIMAL(10,4),
    session_ids_requested TEXT[],
    session_ids_not_found TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_batches_project_id ON transcription_batches(project_id);
CREATE INDEX IF NOT EXISTS idx_batches_user_id ON transcription_batches(user_id);
CREATE INDEX IF NOT EXISTS idx_batches_status ON transcription_batches(status);

-- RLS for batches
ALTER TABLE transcription_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own batches" ON transcription_batches
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own batches" ON transcription_batches
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own batches" ON transcription_batches
    FOR UPDATE USING (user_id = auth.uid());

-- =============================================
-- Table: recordings
-- =============================================
CREATE TABLE IF NOT EXISTS recordings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id VARCHAR(100) NOT NULL,
    question_id VARCHAR(50),
    audio_path TEXT NOT NULL,
    audio_size_bytes INTEGER,
    duration_seconds INTEGER,
    transcription TEXT,
    previous_transcription TEXT,
    language_detected VARCHAR(5),
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    transcribed_at TIMESTAMPTZ,
    batch_id UUID REFERENCES transcription_batches(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_recordings_session_id ON recordings(session_id);
CREATE INDEX IF NOT EXISTS idx_recordings_project_status ON recordings(project_id, status);
CREATE INDEX IF NOT EXISTS idx_recordings_batch_id ON recordings(batch_id);
CREATE INDEX IF NOT EXISTS idx_recordings_created_at ON recordings(created_at);

-- RLS for recordings
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recordings of own projects" ON recordings
    FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can update recordings of own projects" ON recordings
    FOR UPDATE USING (
        project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
    );

-- Note: INSERT is handled by service role (widget uploads)
-- DELETE cascades from project deletion

-- =============================================
-- Functions
-- =============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for projects updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Storage Bucket Setup (run separately or via Dashboard)
-- =============================================
-- Create bucket: voice-recordings
-- Settings:
--   - Public: false
--   - Allowed MIME types: audio/webm, audio/mp3, audio/wav, audio/mpeg, audio/mp4, audio/ogg
--   - Max file size: 10MB (10485760 bytes)

-- Note: Storage policies are typically set via Dashboard
-- The backend uses service_role key to bypass storage RLS

-- =============================================
-- Sample Data (Optional - for testing)
-- =============================================
-- Uncomment to insert test data after creating a user

/*
-- Get your user ID from auth.users after signing up
-- INSERT INTO projects (user_id, name, public_key, language, transcription_mode)
-- VALUES
--     ('your-user-uuid-here', 'Test Project 1', 'proj_test123abc', 'es', 'realtime'),
--     ('your-user-uuid-here', 'Test Project 2', 'proj_test456def', 'en', 'batch');
*/

-- =============================================
-- Verify Setup
-- =============================================
-- Run these to verify tables were created:
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- SELECT * FROM projects LIMIT 1;
-- SELECT * FROM recordings LIMIT 1;
-- SELECT * FROM transcription_batches LIMIT 1;
