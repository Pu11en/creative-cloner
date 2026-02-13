import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const WAVESPEED_API_KEY = process.env.WAVESPEED_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { sceneId, prompt, referenceImages, aspectRatio } = await request.json();

    // Update scene status
    await supabaseAdmin
      .from('cloner_scenes')
      .update({ status_image: 'generating' })
      .eq('id', sceneId);

    // Build request body for Nano Banana Pro
    const requestBody: any = {
      prompt,
      size: aspectRatio === '16:9' ? '1280x720' : aspectRatio === '9:16' ? '720x1280' : aspectRatio === '4:5' ? '864x1080' : '1024x1024',
      num_images: 1,
    };

    // Add reference images if provided
    if (referenceImages && referenceImages.length > 0) {
      requestBody.image = referenceImages[0];
      if (referenceImages.length > 1) {
        requestBody.reference_images = referenceImages;
      }
    }

    // Call WaveSpeed Nano Banana Pro API
    const response = await fetch('https://api.wavespeed.ai/api/v3/google/nano-banana-pro/edit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WAVESPEED_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WaveSpeed API error: ${errorText}`);
    }

    const data = await response.json();
    
    // WaveSpeed returns a task ID for async processing
    const taskId = data.data?.id || data.id;
    
    if (!taskId) {
      // If direct result is returned
      const imageUrl = data.data?.outputs?.[0] || data.outputs?.[0] || data.data?.image_url;
      
      if (imageUrl) {
        await supabaseAdmin
          .from('cloner_scenes')
          .update({ 
            status_image: 'completed',
            start_image_url: imageUrl 
          })
          .eq('id', sceneId);
        
        return NextResponse.json({ success: true, imageUrl });
      }
    }

    return NextResponse.json({ success: true, taskId, status: 'processing' });
  } catch (error: any) {
    console.error('Image generation error:', error);
    
    await supabaseAdmin
      .from('cloner_scenes')
      .update({ status_image: 'error' })
      .eq('id', request.json().then(d => d.sceneId).catch(() => ''));
    
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Poll for task status
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
      const imageUrl = data.data?.outputs?.[0] || data.outputs?.[0];
      
      if (imageUrl && sceneId) {
        await supabaseAdmin
          .from('cloner_scenes')
          .update({ 
            status_image: 'completed',
            start_image_url: imageUrl 
          })
          .eq('id', sceneId);
      }
      
      return NextResponse.json({ success: true, status: 'completed', imageUrl });
    }

    return NextResponse.json({ success: true, status: data.data?.status || data.status || 'processing' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
