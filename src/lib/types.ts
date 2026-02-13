export interface Project {
  id: string;
  project_name: string;
  input_video_url: string | null;
  input_image_1_url: string | null;
  input_image_2_url: string | null;
  input_request: string;
  source_brand: string | null;
  target_brand: string | null;
  product_description: string | null;
  creative_direction: string | null;
  aspect_ratio: '16:9' | '9:16' | '4:5' | '1:1';
  music_prompt: string | null;
  music_url: string | null;
  script: string | null;
  generate_music: boolean;
  status: 'pending' | 'analyzing' | 'generating_prompts' | 'generating_images' | 'generating_videos' | 'completed' | 'error';
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  project_id: string;
  scene_number: number;
  scene_title: string;
  start_image_prompt: string | null;
  video_prompt: string | null;
  status_image: 'pending' | 'generating' | 'completed' | 'error';
  status_video: 'pending' | 'generating' | 'completed' | 'error';
  start_image_url: string | null;
  scene_video_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SEALCaMPrompt {
  subject: string;
  environment: string;
  action: string;
  lighting: string;
  camera: string;
  metatokens: string;
}

export interface VideoAnalysis {
  music_prompt: string;
  script: string;
  scenes: {
    scene_number: number;
    scene_title: string;
    start_image_prompt: SEALCaMPrompt;
    video_prompt: SEALCaMPrompt;
    duration_seconds: number;
  }[];
}
