-- Migration 004: Add input_method column to recordings
-- Tracks whether response came from voice (mic) or text (typed)
-- Default 'voice' for backward compatibility with existing recordings

ALTER TABLE recordings ADD COLUMN IF NOT EXISTS input_method VARCHAR(10) DEFAULT 'voice';
