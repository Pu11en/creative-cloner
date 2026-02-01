'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Project, Scene } from '@/lib/types';
import { Upload, Video, Image, Sparkles, Play, Download, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [refImage1, setRefImage1] = useState<File | null>(null);
  const [refImage2, setRefImage2] = useState<File | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load scenes when project selected
  useEffect(() => {
    if (selectedProject) {
      loadScenes(selectedProject.id);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    const { data } = await supabase
      .from('cloner_projects')
      .select('*')
      .order('created_at', { ascending: false });
    setProjects(data || []);
  };

  const loadScenes = async (projectId: string) => {
    const { data } = await supabase
      .from('cloner_scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('scene_number');
    setScenes(data || []);
  };

  const uploadFile = async (file: File, bucket: string, path: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });
    
    if (error) throw error;
    
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return urlData.publicUrl;
  };

  const createProject = async () => {
    if (!projectName || !userPrompt) {
      alert('Please enter a project name and prompt');
      return;
    }

    setIsCreating(true);
    try {
      const projectId = crypto.randomUUID();
      
      // Upload files if provided
      let videoUrl = null;
      let image1Url = null;
      let image2Url = null;

      if (videoFile) {
        videoUrl = await uploadFile(videoFile, 'videos', `${projectId}/${videoFile.name}`);
      }
      if (refImage1) {
        image1Url = await uploadFile(refImage1, 'images', `${projectId}/ref1-${refImage1.name}`);
      }
      if (refImage2) {
        image2Url = await uploadFile(refImage2, 'images', `${projectId}/ref2-${refImage2.name}`);
      }

      // Create project in database
      const { data: project, error } = await supabase
        .from('cloner_projects')
        .insert({
          id: projectId,
          project_name: projectName,
          input_video_url: videoUrl,
          input_image_1_url: image1Url,
          input_image_2_url: image2Url,
          input_request: userPrompt,
          aspect_ratio: aspectRatio,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      setSelectedProject(project);
      loadProjects();
      
      // Reset form
      setProjectName('');
      setVideoFile(null);
      setRefImage1(null);
      setRefImage2(null);
      setUserPrompt('');
      
    } catch (error: any) {
      alert('Error creating project: ' + error.message);
    } finally {
      setIsCreating(false);
    }
  };

  const startProcessing = async () => {
    if (!selectedProject) return;
    
    setIsProcessing(true);
    try {
      // Step 1: Analyze video and generate prompts
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          videoUrl: selectedProject.input_video_url,
          userPrompt: selectedProject.input_request,
        }),
      });
      
      if (!analyzeRes.ok) throw new Error('Analysis failed');
      
      // Reload scenes
      await loadScenes(selectedProject.id);
      
      // Step 2: Generate images for each scene
      const updatedScenes = await new Promise<Scene[]>((resolve) => {
        setTimeout(async () => {
          const { data } = await supabase
            .from('cloner_scenes')
            .select('*')
            .eq('project_id', selectedProject.id)
            .order('scene_number');
          resolve(data || []);
        }, 1000);
      });

      const referenceImages = [
        selectedProject.input_image_1_url,
        selectedProject.input_image_2_url,
      ].filter(Boolean);

      for (const scene of updatedScenes) {
        await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sceneId: scene.id,
            prompt: scene.start_image_prompt,
            referenceImages,
            aspectRatio: selectedProject.aspect_ratio,
          }),
        });
        
        // Small delay between requests
        await new Promise(r => setTimeout(r, 2000));
      }

      // Step 3: Generate videos for each scene (after images complete)
      await new Promise(r => setTimeout(r, 5000)); // Wait for image generation
      
      const { data: scenesWithImages } = await supabase
        .from('cloner_scenes')
        .select('*')
        .eq('project_id', selectedProject.id)
        .order('scene_number');

      for (const scene of scenesWithImages || []) {
        if (scene.start_image_url) {
          await fetch('/api/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sceneId: scene.id,
              imageUrl: scene.start_image_url,
              prompt: scene.video_prompt,
              aspectRatio: selectedProject.aspect_ratio,
            }),
          });
          
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      // Update project status
      await supabase
        .from('cloner_projects')
        .update({ status: 'completed' })
        .eq('id', selectedProject.id);

      loadScenes(selectedProject.id);
      
    } catch (error: any) {
      console.error('Processing error:', error);
      alert('Error processing: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { icon: any; color: string }> = {
      pending: { icon: Clock, color: 'text-gray-400' },
      analyzing: { icon: Loader2, color: 'text-blue-400 animate-spin' },
      generating_prompts: { icon: Loader2, color: 'text-purple-400 animate-spin' },
      generating_images: { icon: Loader2, color: 'text-orange-400 animate-spin' },
      generating_videos: { icon: Loader2, color: 'text-pink-400 animate-spin' },
      generating: { icon: Loader2, color: 'text-yellow-400 animate-spin' },
      completed: { icon: CheckCircle, color: 'text-green-400' },
      error: { icon: XCircle, color: 'text-red-400' },
    };
    const { icon: Icon, color } = config[status] || config.pending;
    return <Icon className={`w-5 h-5 ${color}`} />;
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-orange-400 bg-clip-text text-transparent mb-4">
            Creative Cloner AI
          </h1>
          <p className="text-gray-400 text-lg">
            Clone and recreate videos using AI-powered scene analysis
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Panel: Create Project */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
              <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                New Project
              </h2>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
                />

                {/* Video Upload */}
                <div className="border-2 border-dashed border-gray-600 rounded-lg p-4 text-center hover:border-purple-500 transition cursor-pointer">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="video-upload"
                  />
                  <label htmlFor="video-upload" className="cursor-pointer">
                    <Video className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">
                      {videoFile ? videoFile.name : 'Upload Video to Clone'}
                    </p>
                  </label>
                </div>

                {/* Reference Images */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-pink-500 transition cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setRefImage1(e.target.files?.[0] || null)}
                      className="hidden"
                      id="ref1-upload"
                    />
                    <label htmlFor="ref1-upload" className="cursor-pointer">
                      <Image className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                      <p className="text-gray-400 text-xs">
                        {refImage1 ? 'Image 1 ✓' : 'Ref Image 1'}
                      </p>
                    </label>
                  </div>
                  <div className="border-2 border-dashed border-gray-600 rounded-lg p-3 text-center hover:border-pink-500 transition cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => setRefImage2(e.target.files?.[0] || null)}
                      className="hidden"
                      id="ref2-upload"
                    />
                    <label htmlFor="ref2-upload" className="cursor-pointer">
                      <Image className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                      <p className="text-gray-400 text-xs">
                        {refImage2 ? 'Image 2 ✓' : 'Ref Image 2'}
                      </p>
                    </label>
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div className="flex gap-2">
                  {(['16:9', '9:16', '1:1'] as const).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                        aspectRatio === ratio
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>

                {/* Prompt */}
                <textarea
                  placeholder="Describe what you want to create..."
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 resize-none"
                />

                <button
                  onClick={createProject}
                  disabled={isCreating}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                  Create Project
                </button>
              </div>

              {/* Projects List */}
              <div className="mt-8">
                <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Projects</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`w-full text-left px-4 py-3 rounded-lg transition flex items-center justify-between ${
                        selectedProject?.id === project.id
                          ? 'bg-purple-600/30 border border-purple-500'
                          : 'bg-gray-700/30 hover:bg-gray-700/50'
                      }`}
                    >
                      <span className="text-white truncate">{project.project_name}</span>
                      <StatusBadge status={project.status} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel: Project Details & Scenes */}
          <div className="lg:col-span-2">
            {selectedProject ? (
              <div className="space-y-6">
                {/* Project Header */}
                <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-6 border border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white">{selectedProject.project_name}</h2>
                      <p className="text-gray-400">{selectedProject.input_request}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={selectedProject.status} />
                      <span className="text-gray-400 capitalize">{selectedProject.status.replace(/_/g, ' ')}</span>
                    </div>
                  </div>

                  {selectedProject.status === 'pending' && (
                    <button
                      onClick={startProcessing}
                      disabled={isProcessing}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                      Start Processing
                    </button>
                  )}

                  {selectedProject.music_prompt && (
                    <div className="mt-4 p-4 bg-gray-700/30 rounded-lg">
                      <p className="text-sm text-gray-400">Music Prompt</p>
                      <p className="text-white">{selectedProject.music_prompt}</p>
                    </div>
                  )}
                </div>

                {/* Scenes Grid */}
                <div className="grid md:grid-cols-2 gap-4">
                  {scenes.map((scene) => (
                    <div
                      key={scene.id}
                      className="bg-gray-800/50 backdrop-blur rounded-xl p-4 border border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-white font-medium">{scene.scene_title}</h3>
                        <div className="flex gap-2">
                          <StatusBadge status={scene.status_image} />
                          <StatusBadge status={scene.status_video} />
                        </div>
                      </div>

                      {/* Image Preview */}
                      {scene.start_image_url ? (
                        <img
                          src={scene.start_image_url}
                          alt={scene.scene_title}
                          className="w-full h-32 object-cover rounded-lg mb-3"
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-700/50 rounded-lg mb-3 flex items-center justify-center">
                          <Image className="w-8 h-8 text-gray-500" />
                        </div>
                      )}

                      {/* Video Preview */}
                      {scene.scene_video_url && (
                        <video
                          src={scene.scene_video_url}
                          controls
                          className="w-full rounded-lg"
                        />
                      )}

                      {/* Prompts */}
                      <div className="mt-3 text-xs text-gray-400 space-y-1">
                        {scene.start_image_prompt && (
                          <p className="truncate">📸 {scene.start_image_prompt}</p>
                        )}
                        {scene.video_prompt && (
                          <p className="truncate">🎬 {scene.video_prompt}</p>
                        )}
                      </div>

                      {/* Download Button */}
                      {scene.scene_video_url && (
                        <a
                          href={scene.scene_video_url}
                          download
                          className="mt-3 inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 text-sm"
                        >
                          <Download className="w-4 h-4" />
                          Download Video
                        </a>
                      )}
                    </div>
                  ))}
                </div>

                {scenes.length === 0 && selectedProject.status === 'pending' && (
                  <div className="text-center py-12 text-gray-400">
                    <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Click "Start Processing" to analyze the video and generate scenes</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-800/50 backdrop-blur rounded-2xl p-12 border border-gray-700 text-center">
                <Video className="w-16 h-16 text-gray-500 mx-auto mb-4" />
                <h3 className="text-xl text-white mb-2">No Project Selected</h3>
                <p className="text-gray-400">Create a new project or select an existing one to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
