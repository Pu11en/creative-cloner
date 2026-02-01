import { NextResponse } from 'next/server';

// This endpoint provides setup instructions since we can't run DDL via PostgREST
export async function GET() {
  const setupSQL = `
-- Run this SQL in Supabase Dashboard → SQL Editor

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  input_video_url TEXT,
  input_image_1_url TEXT,
  input_image_2_url TEXT,
  input_request TEXT NOT NULL,
  aspect_ratio TEXT DEFAULT '16:9',
  music_prompt TEXT,
  script TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scenes table
CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  scene_title TEXT NOT NULL,
  start_image_prompt TEXT,
  video_prompt TEXT,
  status_image TEXT DEFAULT 'pending',
  status_video TEXT DEFAULT 'pending',
  start_image_url TEXT,
  scene_video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;

-- Allow all policies (public access for now)
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on scenes" ON scenes FOR ALL USING (true) WITH CHECK (true);
`;

  return NextResponse.json({
    message: 'Copy this SQL and run it in Supabase Dashboard → SQL Editor',
    url: 'https://supabase.com/dashboard/project/swvljsixpvvcirjmflze/sql/new',
    sql: setupSQL
  });
}
