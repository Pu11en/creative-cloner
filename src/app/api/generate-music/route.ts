import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const KIE_API_KEY = process.env.WAVESPEED_API_KEY!; // Same key works for Kie AI

export async function POST(request: NextRequest) {
  try {
    const { projectId, prompt, style, duration } = await request.json();

    // Call Suno API via Kie AI
    const response = await fetch('https://api.kie.ai/api/v1/suno/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        style: style || 'cinematic advertising music',
        duration: duration || 30,
        instrumental: true, // Usually want instrumental for ads
      }),
    });

    if (!response.ok) {
      // Fallback to alternative endpoint
      const altResponse = await fetch('https://api.wavespeed.ai/api/v3/suno/generate', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KIE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: `${style || 'cinematic'} ${prompt}`,
          duration: duration || 30,
        }),
      });
      
      if (!altResponse.ok) {
        const errorText = await altResponse.text();
        throw new Error(`Suno API error: ${errorText}`);
      }
      
      const altData = await altResponse.json();
      return NextResponse.json({ 
        success: true, 
        taskId: altData.data?.id || altData.id,
        status: 'processing' 
      });
    }

    const data = await response.json();
    const taskId = data.data?.id || data.id;
    
    // If direct result
    if (data.data?.audio_url || data.audio_url) {
      const musicUrl = data.data?.audio_url || data.audio_url;
      
      await supabaseAdmin
        .from('cloner_projects')
        .update({ music_url: musicUrl })
        .eq('id', projectId);
      
      return NextResponse.json({ success: true, musicUrl });
    }

    return NextResponse.json({ success: true, taskId, status: 'processing' });
  } catch (error: any) {
    console.error('Music generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Poll for music task status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get('taskId');
    const projectId = searchParams.get('projectId');

    if (!taskId) {
      return NextResponse.json({ error: 'Task ID required' }, { status: 400 });
    }

    const response = await fetch(`https://api.kie.ai/api/v1/tasks/${taskId}`, {
      headers: {
        'Authorization': `Bearer ${KIE_API_KEY}`,
      },
    });

    const data = await response.json();
    
    if (data.status === 'completed' || data.data?.status === 'completed') {
      const musicUrl = data.data?.audio_url || data.audio_url || data.data?.outputs?.[0];
      
      if (musicUrl && projectId) {
        await supabaseAdmin
          .from('cloner_projects')
          .update({ music_url: musicUrl })
          .eq('id', projectId);
      }
      
      return NextResponse.json({ success: true, status: 'completed', musicUrl });
    }

    return NextResponse.json({ success: true, status: data.status || 'processing' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
