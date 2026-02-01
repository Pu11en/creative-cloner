import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { projectId, videoUrl, userPrompt } = await request.json();

    // Update project status
    await supabaseAdmin
      .from('cloner_projects')
      .update({ status: 'analyzing' })
      .eq('id', projectId);

    // Analyze video with Gemini
    const analysisPrompt = `You are an expert video analyst. Analyze this video and extract scenes for recreation.

User's request: ${userPrompt}

IMPORTANT: Output ONLY valid JSON, no markdown code blocks.

Use the SEALCaM framework for all prompts:
- S (Subject): Main subject/character description
- E (Environment): Setting, background, location
- A (Action): What's happening, movement
- L (Lighting): Light quality, direction, mood
- Ca (Camera): Shot type, angle, movement
- M (Metatokens): Style keywords, quality tags

Analyze the video and return this JSON structure:
{
  "music_prompt": "Description of background music/audio mood",
  "script": "Narration or text that appears",
  "scenes": [
    {
      "scene_number": 1,
      "scene_title": "Scene 1 - Opening",
      "start_image_prompt": {
        "subject": "...",
        "environment": "...",
        "action": "...",
        "lighting": "...",
        "camera": "...",
        "metatokens": "..."
      },
      "video_prompt": {
        "subject": "...",
        "environment": "...",
        "action": "...",
        "lighting": "...",
        "camera": "...",
        "metatokens": "..."
      },
      "duration_seconds": 3
    }
  ]
}

Identify 3-8 distinct scenes. Each scene should be recreatable as a 5-10 second video clip.`;

    // Upload video to Gemini Files API first
    const uploadResponse = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'X-Goog-Upload-Command': 'start, upload, finalize',
          'X-Goog-Upload-Header-Content-Type': 'video/mp4',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file: { displayName: 'uploaded_video' },
        }),
      }
    );

    // For now, use URL directly if it's accessible
    // Gemini can analyze videos via URL
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  fileData: {
                    mimeType: 'video/mp4',
                    fileUri: videoUrl,
                  },
                },
                { text: analysisPrompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    let analysis;
    
    if (!response.ok) {
      // Fallback: Use text-only analysis if video upload fails
      console.log('Video analysis failed, using text-based generation');
      
      const textResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: `Based on this request: "${userPrompt}"
                  
Generate a creative video storyboard with 4-6 scenes. Output ONLY valid JSON:

${analysisPrompt}` },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 8192,
            },
          }),
        }
      );
      
      const textData = await textResponse.json();
      const textContent = textData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanedText = textContent.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanedText);
    } else {
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();
      analysis = JSON.parse(cleanedContent);
    }

    // Update project with analysis results
    await supabaseAdmin
      .from('cloner_projects')
      .update({
        status: 'generating_prompts',
        music_prompt: analysis.music_prompt,
        script: analysis.script,
      })
      .eq('id', projectId);

    // Create scenes in database
    const scenesData = analysis.scenes.map((scene: any) => ({
      project_id: projectId,
      scene_number: scene.scene_number,
      scene_title: scene.scene_title,
      start_image_prompt: formatSEALCaM(scene.start_image_prompt),
      video_prompt: formatSEALCaM(scene.video_prompt),
      status_image: 'pending',
      status_video: 'pending',
    }));

    await supabaseAdmin.from('cloner_scenes').insert(scenesData);

    // Update project status
    await supabaseAdmin
      .from('cloner_projects')
      .update({ status: 'generating_images' })
      .eq('id', projectId);

    return NextResponse.json({ success: true, analysis });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function formatSEALCaM(prompt: any): string {
  if (typeof prompt === 'string') return prompt;
  return `${prompt.subject}. ${prompt.environment}. ${prompt.action}. ${prompt.lighting}. ${prompt.camera}. ${prompt.metatokens}`;
}
