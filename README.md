# Creative Cloner AI

A video cloning tool that analyzes uploaded videos using AI and recreates them scene by scene.

## Features

- 🎬 Video analysis with Google Gemini
- 🎨 Image generation with Nano Banana Pro
- 📹 Video generation with Kling v2.6 Pro
- 🖼️ Reference image support for consistency
- 📐 Multiple aspect ratios (16:9, 9:16, 1:1)

## Setup

### 1. Database Setup

Run this SQL in your Supabase Dashboard (SQL Editor):

```sql
-- Projects table
CREATE TABLE projects (
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
CREATE TABLE scenes (
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

-- Allow all policies
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on scenes" ON scenes FOR ALL USING (true) WITH CHECK (true);
```

### 2. Storage Buckets

Create two public buckets in Supabase Storage:
- `videos` - for uploaded videos
- `images` - for reference and generated images

### 3. Environment Variables

Set these in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `WAVESPEED_API_KEY`

## SEALCaM Framework

All prompts follow the SEALCaM structure:
- **S** – Subject
- **E** – Environment
- **A** – Action
- **L** – Lighting
- **Ca** – Camera
- **M** – Metatokens

## Development

```bash
npm install
npm run dev
```

## Deployment

```bash
vercel deploy --prod
```
