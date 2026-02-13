-- Creative Cloner Database Schema
-- Run this in Supabase Dashboard → SQL Editor
-- https://supabase.com/dashboard/project/swvljsixpvvcirjmflze/sql/new

-- Cloner Projects table
CREATE TABLE IF NOT EXISTS cloner_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_name TEXT NOT NULL,
  input_video_url TEXT,
  input_image_1_url TEXT,
  input_image_2_url TEXT,
  input_request TEXT NOT NULL,
  -- Branding fields
  source_brand TEXT,
  target_brand TEXT,
  product_description TEXT,
  creative_direction TEXT,
  -- Output fields
  aspect_ratio TEXT DEFAULT '9:16' CHECK (aspect_ratio IN ('16:9', '9:16', '4:5', '1:1')),
  music_prompt TEXT,
  music_url TEXT,
  script TEXT,
  generate_music BOOLEAN DEFAULT true,
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'analyzing', 'generating_prompts', 'generating_images', 'generating_videos', 'completed', 'error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scenes table
CREATE TABLE IF NOT EXISTS cloner_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES cloner_projects(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  scene_title TEXT NOT NULL,
  start_image_prompt TEXT,
  video_prompt TEXT,
  status_image TEXT DEFAULT 'pending' CHECK (status_image IN ('pending', 'generating', 'completed', 'error')),
  status_video TEXT DEFAULT 'pending' CHECK (status_video IN ('pending', 'generating', 'completed', 'error')),
  start_image_url TEXT,
  scene_video_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cloner_scenes_project_id ON cloner_scenes(project_id);
CREATE INDEX IF NOT EXISTS idx_cloner_projects_status ON cloner_projects(status);

-- Enable RLS
ALTER TABLE cloner_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloner_scenes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow all on cloner_projects" ON cloner_projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on cloner_scenes" ON cloner_scenes FOR ALL USING (true) WITH CHECK (true);
