import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { projectId, videoUrl, userPrompt, sourceBrand, targetBrand } = await request.json();

    // Update project status
    await supabaseAdmin
      .from('cloner_projects')
      .update({ status: 'analyzing' })
      .eq('id', projectId);

    // Build context for brand transformation
    const brandContext = sourceBrand && targetBrand 
      ? `\n\nBRAND TRANSFORMATION: This is a "${sourceBrand}" style ad being recreated for "${targetBrand}". Adapt all visual descriptions, product references, and styling to match the ${targetBrand} brand aesthetic.`
      : '';

    // Analyze video with Gemini
    const analysisPrompt = `You are an expert video analyst and advertising creative director. Analyze this video and extract scenes for recreation.

User's request: ${userPrompt}${brandContext}

IMPORTANT: Output ONLY valid JSON, no markdown code blocks.

Use the SEALCaM framework for all prompts. Fields MUST appear in this EXACT order:

**S – Subject**
What the camera is optically prioritizing within the frame.
Terms: primary subject, secondary subject, foreground element, background element

**E – Environment**
The physical or constructed space surrounding the subject.
Terms: location type, set design, spatial depth, background treatment

**A – Action**
Observable motion within the frame, including subject and camera movement.
Terms: subject movement, camera movement, environmental motion

**L – Lighting**
The lighting setup and exposure characteristics.
Terms: key light, fill, rim, practicals, contrast ratio, exposure level, color temperature

**Ca – Camera** (MUST include ALL of these):
- Camera type: cinema camera or stills camera (ARRI Alexa, RED, Sony FX, DSLR, mirrorless)
- Lens type and focal length (35mm prime, 85mm portrait lens, 50mm cinematic lens)
- Framing and angle (wide, medium, close-up; eye-level, low-angle, high-angle)
- Camera motion (locked-off, handheld, dolly, pan, tilt, tracking shot)

**M – Metatokens**
Visual production qualifiers: realism level, texture and grain, motion cadence, render quality, platform cues

Analyze the video and return this JSON structure:
{
  "music_prompt": "Description of background music/audio mood for Suno to generate",
  "script": "Any narration, voiceover, or on-screen text",
  "scenes": [
    {
      "scene_number": 1,
      "scene_title": "Scene 1 - Opening",
      "start_image_prompt": {
        "S_subject": "Primary subject description, secondary subjects, foreground/background elements",
        "E_environment": "Location type, set design, spatial depth, background treatment",
        "A_action": "Static pose or moment captured (for still image)",
        "L_lighting": "Key light position, fill, rim, practicals, contrast ratio, color temperature",
        "Ca_camera": "Camera type (ARRI Alexa/RED/Sony), lens (50mm prime), framing (medium shot), angle (eye-level), position (locked-off)",
        "M_metatokens": "Realism level, texture, grain, render quality, cinematic, 8K, photorealistic"
      },
      "video_prompt": {
        "S_subject": "Primary subject description with motion intent",
        "E_environment": "Location with spatial depth for movement",
        "A_action": "Subject movement (walks, turns, gestures), camera movement (dolly forward, pan left), environmental motion (wind, particles)",
        "L_lighting": "Lighting with any changes during motion",
        "Ca_camera": "Camera type, lens, framing, angle, camera motion (tracking shot, dolly, handheld)",
        "M_metatokens": "Motion cadence (smooth, dynamic), temporal quality, cinematic motion blur"
      },
      "duration_seconds": 5
    }
  ]
}

IMPORTANT:
- Identify 3-8 distinct scenes
- Each scene should be 5-10 seconds when recreated
- start_image_prompt describes a STILL IMAGE (the first frame)
- video_prompt describes MOTION from that starting image
- Camera field MUST include: camera type, lens/focal length, framing, angle, and motion
- All fields in exact S, E, A, L, Ca, M order`;

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
  
  // Support both old and new field naming
  const s = prompt.S_subject || prompt.subject || '';
  const e = prompt.E_environment || prompt.environment || '';
  const a = prompt.A_action || prompt.action || '';
  const l = prompt.L_lighting || prompt.lighting || '';
  const ca = prompt.Ca_camera || prompt.camera || '';
  const m = prompt.M_metatokens || prompt.metatokens || '';
  
  // Format in exact SEALCaM order with clear structure
  return [
    `[Subject] ${s}`,
    `[Environment] ${e}`,
    `[Action] ${a}`,
    `[Lighting] ${l}`,
    `[Camera] ${ca}`,
    `[Metatokens] ${m}`
  ].filter(part => part.length > 15).join('. '); // Filter out empty sections
}
