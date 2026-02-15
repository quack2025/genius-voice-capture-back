-- Migration 003: Add 'enterprise' to plan CHECK constraint
-- Run this in Supabase SQL Editor

-- 1. Drop existing CHECK constraint and recreate with 'enterprise'
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_plan_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_plan_check
    CHECK (plan IN ('free', 'freelancer', 'pro', 'enterprise'));

-- Verify
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'user_profiles_plan_check';
