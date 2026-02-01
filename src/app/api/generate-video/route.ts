import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { sceneId, imageUrl, prompt, aspectRatio } = await request.json();

    // Update scene status
    await supabaseAdmin
      .from('scenes')
      .update({ status_video: 'generating' })
      .eq('id', sceneId);

    // Build request for Kling v2.6 Pro (image-to-video)
    const requestBody = {
      image: imageUrl,
      prompt,
      aspect_ratio: aspectRatio || '16:9',
      duration: 5, // 5 seconds per scene
    };

    // Call WaveSpeed Kling API
    const response = await fetch('https://api.wavespeed.ai/api/v3/kwaivgi/kling-v2.6-pro/image-to-video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kling API error: ${errorText}`);
    }

    const data = await response.json();
    const taskId = data.data?.id || data.id;

    if (!taskId) {
      // Direct result
      const videoUrl = data.data?.outputs?.[0] || data.outputs?.[0] || data.data?.video_url;
      
      if (videoUrl) {
        await supabaseAdmin
          .from('scenes')
          .update({ 
            status_video: 'completed',
            scene_video_url: videoUrl 
          })
          .eq('id', sceneId);
        
        return NextResponse.json({ success: true, videoUrl });
      }
    }

    return NextResponse.json({ success: true, taskId, status: 'processing' });
  } catch (error: any) {
    console.error('Video generation error:', error);
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Poll for video task status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const sceneId = searchParams.get('sceneId');

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const response = await fetch(`https://api.wavespeed.ai/api/v3/predictions/${taskId}/result`, {
      headers: {
        'Authorization': `Bearer ${WAVESPEED_API_KEY}`,
      },
    });

    const data = await response.json();
    
    if (data.data?.status === 'completed' || data.status === 'completed') {
      const videoUrl = data.data?.outputs?.[0] || data.outputs?.[0];
      
      if (videoUrl && sceneId) {
        await supabaseAdmin
          .from('scenes')
          .update({ 
            status_video: 'completed',
            scene_video_url: videoUrl 
          })
          .eq('id', sceneId);
      }
      
      return NextResponse.json({ success: true, status: 'completed', videoUrl });
    }

    return NextResponse.json({ success: true, status: data.data?.status || data.status || 'processing' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
