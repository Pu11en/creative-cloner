import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://swvljsixpvvcirjmflze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dmxqc2l4cHZ2Y2lyam1mbHplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzU2OTEzNCwiZXhwIjoyMDgzMTQ1MTM0fQ.2XRSViXVJbn_sVcxL3keP5ZIDlz3Ge4MFQOkilV6Q48'
);

async function setupDatabase() {
  console.log('Setting up Creative Cloner database...\n');

  // Test if projects table exists by trying to query it
  const { error: testError } = await supabase.from('projects').select('id').limit(1);
  
  if (testError && testError.code === '42P01') {
    console.log('Tables do not exist. Please run the following SQL in Supabase Dashboard:\n');
    console.log(`
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

-- Allow all policies (add auth later)
CREATE POLICY "Allow all on projects" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on scenes" ON scenes FOR ALL USING (true) WITH CHECK (true);
`);
    return false;
  } else if (testError) {
    console.error('Error checking tables:', testError);
    return false;
  }
  
  console.log('✅ Tables exist!');

  // Check/create storage buckets
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketNames = buckets?.map(b => b.name) || [];

  if (!bucketNames.includes('videos')) {
    const { error } = await supabase.storage.createBucket('videos', { public: true });
    if (error && !error.message.includes('already exists')) {
      console.error('Error creating videos bucket:', error);
    } else {
      console.log('✅ Created videos bucket');
    }
  } else {
    console.log('✅ Videos bucket exists');
  }

  if (!bucketNames.includes('images')) {
    const { error } = await supabase.storage.createBucket('images', { public: true });
    if (error && !error.message.includes('already exists')) {
      console.error('Error creating images bucket:', error);
    } else {
      console.log('✅ Created images bucket');
    }
  } else {
    console.log('✅ Images bucket exists');
  }

  console.log('\n✅ Database setup complete!');
  return true;
}

setupDatabase().catch(console.error);
