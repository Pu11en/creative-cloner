'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Project, Scene } from '@/lib/types';
import { 
  Upload, Video, Image, Sparkles, Play, Download, Loader2, 
  CheckCircle, XCircle, Clock, Music, Palette, Building2,
  ArrowRight, Wand2, Copy, ExternalLink
} from 'lucide-react';

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  // Form state
  const [projectName, setProjectName] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [refImage1, setRefImage1] = useState<File | null>(null);
  const [refImage2, setRefImage2] = useState<File | null>(null);
  
  // Branding inputs
  const [sourceBrand, setSourceBrand] = useState('');
  const [targetBrand, setTargetBrand] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [creativeDirection, setCreativeDirection] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '4:5' | '1:1'>('9:16');
  const [generateMusic, setGenerateMusic] = useState(true);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadScenes(selectedProject.id);
    }
  }, [selectedProject]);

  // Poll for updates when processing
  useEffect(() => {
    if (selectedProject && isProcessing) {
      const interval = setInterval(async () => {
        const { data: project } = await supabase
          .from('projects')
          .select('*')
          .eq('id', selectedProject.id)
          .single();
        
        if (project) {
          setSelectedProject(project);
          if (project.status === 'completed' || project.status === 'error') {
            setIsProcessing(false);
          }
        }
        
        loadScenes(selectedProject.id);
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [selectedProject, isProcessing]);

  const loadProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    setProjects(data || []);
  };

  const loadScenes = async (projectId: string) => {
    const { data } = await supabase
      .from('scenes')
      .select('*')
      .eq('project_id', projectId)
      .order('scene_number');
    setScenes(data || []);
  };

  const uploadFile = async (file: File, bucket: string, path: string): Promise<string> => {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true });
    
    if (error) throw error;
    
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return urlData.publicUrl;
  };

  const buildPrompt = () => {
    let prompt = '';
    
    if (sourceBrand && targetBrand) {
      prompt += `Transform this ${sourceBrand} style advertisement into a ${targetBrand} branded version. `;
    }
    
    if (productDescription) {
      prompt += `Feature this product: ${productDescription}. `;
    }
    
    if (creativeDirection) {
      prompt += `Creative direction: ${creativeDirection}. `;
    }
    
    if (!prompt) {
      prompt = 'Recreate this video with high production value.';
    }
    
    return prompt;
  };

  const createProject = async () => {
    if (!projectName) {
      alert('Please enter a project name');
      return;
    }

    if (!targetBrand && !productDescription && !creativeDirection) {
      alert('Please provide at least a target brand, product description, or creative direction');
      return;
    }

    setIsCreating(true);
    try {
      const projectId = crypto.randomUUID();
      
      let uploadedVideoUrl = videoUrl || null;
      let image1Url = null;
      let image2Url = null;

      if (videoFile) {
        uploadedVideoUrl = await uploadFile(videoFile, 'videos', `${projectId}/${videoFile.name}`);
      }
      if (refImage1) {
        image1Url = await uploadFile(refImage1, 'images', `${projectId}/ref1-${refImage1.name}`);
      }
      if (refImage2) {
        image2Url = await uploadFile(refImage2, 'images', `${projectId}/ref2-${refImage2.name}`);
      }

      const userPrompt = buildPrompt();

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          id: projectId,
          project_name: projectName,
          input_video_url: uploadedVideoUrl,
          input_image_1_url: image1Url,
          input_image_2_url: image2Url,
          input_request: userPrompt,
          source_brand: sourceBrand,
          target_brand: targetBrand,
          product_description: productDescription,
          creative_direction: creativeDirection,
          aspect_ratio: aspectRatio,
          generate_music: generateMusic,
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
      setVideoUrl('');
      setRefImage1(null);
      setRefImage2(null);
      setSourceBrand('');
      setTargetBrand('');
      setProductDescription('');
      setCreativeDirection('');
      
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
      // Step 1: Analyze video
      setProcessingStep('Analyzing video with AI...');
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          videoUrl: selectedProject.input_video_url,
          userPrompt: selectedProject.input_request,
          sourceBrand: (selectedProject as any).source_brand,
          targetBrand: (selectedProject as any).target_brand,
        }),
      });
      
      if (!analyzeRes.ok) {
        const error = await analyzeRes.json();
        throw new Error(error.error || 'Analysis failed');
      }
      
      await loadScenes(selectedProject.id);
      
      // Step 2: Generate music (if enabled)
      if ((selectedProject as any).generate_music) {
        setProcessingStep('Generating music with Suno...');
        await fetch('/api/generate-music', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: selectedProject.id,
            prompt: selectedProject.music_prompt || `${(selectedProject as any).target_brand || 'luxury'} brand advertisement music`,
            style: 'cinematic advertising',
            duration: 30,
          }),
        });
      }
      
      // Step 3: Generate images
      setProcessingStep('Generating images...');
      const { data: scenesData } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', selectedProject.id)
        .order('scene_number');

      const referenceImages = [
        selectedProject.input_image_1_url,
        selectedProject.input_image_2_url,
      ].filter(Boolean);

      for (const scene of scenesData || []) {
        setProcessingStep(`Generating image for ${scene.scene_title}...`);
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
        await new Promise(r => setTimeout(r, 3000));
      }

      // Step 4: Generate videos
      setProcessingStep('Generating videos with Kling...');
      await new Promise(r => setTimeout(r, 10000)); // Wait for images
      
      const { data: scenesWithImages } = await supabase
        .from('scenes')
        .select('*')
        .eq('project_id', selectedProject.id)
        .order('scene_number');

      for (const scene of scenesWithImages || []) {
        if (scene.start_image_url) {
          setProcessingStep(`Creating video for ${scene.scene_title}...`);
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
          await new Promise(r => setTimeout(r, 3000));
        }
      }

      // Update project status
      await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', selectedProject.id);

      setProcessingStep('Complete!');
      loadScenes(selectedProject.id);
      
      // Refresh project
      const { data: updatedProject } = await supabase
        .from('projects')
        .select('*')
        .eq('id', selectedProject.id)
        .single();
      if (updatedProject) setSelectedProject(updatedProject);
      
    } catch (error: any) {
      console.error('Processing error:', error);
      setProcessingStep(`Error: ${error.message}`);
      
      await supabase
        .from('projects')
        .update({ status: 'error' })
        .eq('id', selectedProject.id);
    } finally {
      setTimeout(() => setIsProcessing(false), 2000);
    }
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config: Record<string, { icon: any; color: string; bg: string }> = {
      pending: { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-500/20' },
      analyzing: { icon: Loader2, color: 'text-blue-400 animate-spin', bg: 'bg-blue-500/20' },
      generating_prompts: { icon: Loader2, color: 'text-purple-400 animate-spin', bg: 'bg-purple-500/20' },
      generating_images: { icon: Loader2, color: 'text-orange-400 animate-spin', bg: 'bg-orange-500/20' },
      generating_videos: { icon: Loader2, color: 'text-pink-400 animate-spin', bg: 'bg-pink-500/20' },
      generating: { icon: Loader2, color: 'text-yellow-400 animate-spin', bg: 'bg-yellow-500/20' },
      completed: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/20' },
      error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/20' },
    };
    const { icon: Icon, color, bg } = config[status] || config.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${bg}`}>
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className={color}>{status.replace(/_/g, ' ')}</span>
      </span>
    );
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      {/* Hero Header */}
      <div className="border-b border-gray-800 bg-gradient-to-r from-purple-900/20 via-transparent to-pink-900/20">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl">
              <Copy className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">Creative Cloner</h1>
          </div>
          <p className="text-gray-400 max-w-2xl">
            Clone winning ads with YOUR brand. Take any high-performing video ad and recreate it 
            with your product, your style, your creative direction.
          </p>
          
          {/* Quick links */}
          <div className="flex gap-4 mt-4">
            <a 
              href="https://app.magicbrief.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Find ads on MagicBrief
            </a>
            <a 
              href="https://www.sortfeed.com/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-pink-400 hover:text-pink-300 flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Find content on SortFeed
            </a>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Panel: Create Project */}
          <div className="lg:col-span-1 space-y-6">
            {/* New Project Card */}
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl p-6 border border-gray-800">
              <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-purple-400" />
                Clone an Ad
              </h2>

              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Project Name (e.g., Prada to Aje Clone)"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                />

                {/* Source Video */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400">Source Video (the ad to clone)</label>
                  <div className="border-2 border-dashed border-gray-700 rounded-xl p-4 text-center hover:border-purple-500/50 transition cursor-pointer bg-gray-800/30">
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                      className="hidden"
                      id="video-upload"
                    />
                    <label htmlFor="video-upload" className="cursor-pointer">
                      <Video className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm">
                        {videoFile ? videoFile.name : 'Upload video file'}
                      </p>
                    </label>
                  </div>
                  <input
                    type="url"
                    placeholder="Or paste video URL..."
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {/* Brand Transform */}
                <div className="bg-gray-800/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                    <Building2 className="w-4 h-4" />
                    Brand Transform
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Source brand (e.g., Prada)"
                      value={sourceBrand}
                      onChange={(e) => setSourceBrand(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    />
                    <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <input
                      type="text"
                      placeholder="Your brand (e.g., Aje)"
                      value={targetBrand}
                      onChange={(e) => setTargetBrand(e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                {/* Product & Direction */}
                <textarea
                  placeholder="Your product description (what should appear in the ad?)"
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none text-sm"
                />

                <textarea
                  placeholder="Creative direction (style, mood, specific requests...)"
                  value={creativeDirection}
                  onChange={(e) => setCreativeDirection(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-800/50 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-none text-sm"
                />

                {/* Reference Images */}
                <div className="space-y-2">
                  <label className="text-sm text-gray-400 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Reference Images (product/brand assets)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="border-2 border-dashed border-gray-700 rounded-xl p-3 text-center hover:border-pink-500/50 transition cursor-pointer bg-gray-800/30">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setRefImage1(e.target.files?.[0] || null)}
                        className="hidden"
                        id="ref1-upload"
                      />
                      <label htmlFor="ref1-upload" className="cursor-pointer">
                        <Image className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                        <p className="text-gray-500 text-xs">
                          {refImage1 ? '✓ Added' : 'Product Image'}
                        </p>
                      </label>
                    </div>
                    <div className="border-2 border-dashed border-gray-700 rounded-xl p-3 text-center hover:border-pink-500/50 transition cursor-pointer bg-gray-800/30">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => setRefImage2(e.target.files?.[0] || null)}
                        className="hidden"
                        id="ref2-upload"
                      />
                      <label htmlFor="ref2-upload" className="cursor-pointer">
                        <Image className="w-5 h-5 text-gray-500 mx-auto mb-1" />
                        <p className="text-gray-500 text-xs">
                          {refImage2 ? '✓ Added' : 'Brand Asset'}
                        </p>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Options Row */}
                <div className="flex gap-3 items-center">
                  {/* Aspect Ratio */}
                  <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                    {(['16:9', '9:16', '4:5', '1:1'] as const).map((ratio) => (
                      <button
                        key={ratio}
                        onClick={() => setAspectRatio(ratio)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                          aspectRatio === ratio
                            ? 'bg-purple-600 text-white'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                  
                  {/* Music Toggle */}
                  <button
                    onClick={() => setGenerateMusic(!generateMusic)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      generateMusic
                        ? 'bg-pink-600/20 text-pink-400 border border-pink-500/30'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                    }`}
                  >
                    <Music className="w-3.5 h-3.5" />
                    Music
                  </button>
                </div>

                <button
                  onClick={createProject}
                  disabled={isCreating}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3.5 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20"
                >
                  {isCreating ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  Create Project
                </button>
              </div>
            </div>

            {/* Projects List */}
            <div className="bg-gray-900/50 backdrop-blur rounded-2xl p-6 border border-gray-800">
              <h3 className="text-sm font-medium text-gray-400 mb-4">Recent Projects</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {projects.length === 0 ? (
                  <p className="text-gray-600 text-sm text-center py-4">No projects yet</p>
                ) : (
                  projects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className={`w-full text-left px-4 py-3 rounded-xl transition ${
                        selectedProject?.id === project.id
                          ? 'bg-purple-600/20 border border-purple-500/50'
                          : 'bg-gray-800/30 hover:bg-gray-800/50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-medium truncate">{project.project_name}</span>
                        <StatusBadge status={project.status} />
                      </div>
                      {(project as any).target_brand && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          → {(project as any).target_brand}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Panel: Project Details & Scenes */}
          <div className="lg:col-span-2">
            {selectedProject ? (
              <div className="space-y-6">
                {/* Project Header */}
                <div className="bg-gray-900/50 backdrop-blur rounded-2xl p-6 border border-gray-800">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-1">{selectedProject.project_name}</h2>
                      <div className="flex items-center gap-3 text-sm">
                        {(selectedProject as any).source_brand && (selectedProject as any).target_brand && (
                          <span className="text-gray-400">
                            {(selectedProject as any).source_brand} 
                            <ArrowRight className="w-3 h-3 inline mx-1" />
                            <span className="text-pink-400">{(selectedProject as any).target_brand}</span>
                          </span>
                        )}
                        <StatusBadge status={selectedProject.status} />
                      </div>
                    </div>
                    
                    {selectedProject.status === 'pending' && (
                      <button
                        onClick={startProcessing}
                        disabled={isProcessing}
                        className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-2.5 rounded-xl font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-green-500/20"
                      >
                        {isProcessing ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Play className="w-5 h-5" />
                        )}
                        Start Cloning
                      </button>
                    )}
                  </div>

                  {/* Processing Status */}
                  {isProcessing && processingStep && (
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 mb-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                        <span className="text-purple-300">{processingStep}</span>
                      </div>
                    </div>
                  )}

                  {/* Project Details */}
                  <div className="grid md:grid-cols-2 gap-4 mt-4">
                    {selectedProject.input_request && (
                      <div className="bg-gray-800/30 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1">Creative Brief</p>
                        <p className="text-gray-300 text-sm">{selectedProject.input_request}</p>
                      </div>
                    )}
                    {selectedProject.music_prompt && (
                      <div className="bg-gray-800/30 rounded-xl p-4">
                        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <Music className="w-3 h-3" /> Music Direction
                        </p>
                        <p className="text-gray-300 text-sm">{selectedProject.music_prompt}</p>
                      </div>
                    )}
                  </div>

                  {/* Music Player */}
                  {(selectedProject as any).music_url && (
                    <div className="mt-4 bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-xl p-4">
                      <p className="text-xs text-pink-400 mb-2 flex items-center gap-1">
                        <Music className="w-3 h-3" /> Generated Music
                      </p>
                      <audio controls className="w-full" src={(selectedProject as any).music_url} />
                    </div>
                  )}
                </div>

                {/* Scenes Grid */}
                {scenes.length > 0 && (
                  <div className="grid md:grid-cols-2 gap-4">
                    {scenes.map((scene) => (
                      <div
                        key={scene.id}
                        className="bg-gray-900/50 backdrop-blur rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-white font-medium text-sm">{scene.scene_title}</h3>
                          <div className="flex gap-1">
                            <StatusBadge status={scene.status_image} />
                            <StatusBadge status={scene.status_video} />
                          </div>
                        </div>

                        {/* Image/Video Preview */}
                        <div className="aspect-video bg-gray-800 rounded-lg overflow-hidden mb-3">
                          {scene.scene_video_url ? (
                            <video
                              src={scene.scene_video_url}
                              controls
                              className="w-full h-full object-cover"
                            />
                          ) : scene.start_image_url ? (
                            <img
                              src={scene.start_image_url}
                              alt={scene.scene_title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Video className="w-8 h-8 text-gray-600" />
                            </div>
                          )}
                        </div>

                        {/* Prompts Preview */}
                        <div className="space-y-1.5 text-xs">
                          {scene.start_image_prompt && (
                            <p className="text-gray-500 line-clamp-2">
                              <span className="text-gray-400">📸</span> {scene.start_image_prompt}
                            </p>
                          )}
                          {scene.video_prompt && (
                            <p className="text-gray-500 line-clamp-2">
                              <span className="text-gray-400">🎬</span> {scene.video_prompt}
                            </p>
                          )}
                        </div>

                        {/* Download */}
                        {scene.scene_video_url && (
                          <a
                            href={scene.scene_video_url}
                            download
                            className="mt-3 inline-flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-xs"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {scenes.length === 0 && selectedProject.status === 'pending' && (
                  <div className="bg-gray-900/50 backdrop-blur rounded-2xl p-12 border border-gray-800 text-center">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Wand2 className="w-8 h-8 text-purple-400" />
                    </div>
                    <h3 className="text-lg text-white mb-2">Ready to Clone</h3>
                    <p className="text-gray-500 text-sm max-w-md mx-auto">
                      Click "Start Cloning" to analyze the source video, generate scene prompts, 
                      create images, and produce video clips with your branding.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-gray-900/50 backdrop-blur rounded-2xl p-12 border border-gray-800 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <Copy className="w-10 h-10 text-gray-600" />
                </div>
                <h3 className="text-xl text-white mb-3">Clone Winning Ads</h3>
                <p className="text-gray-500 max-w-md mx-auto mb-6">
                  Take any high-performing video ad and recreate it with your brand, 
                  your product, and your creative direction. Scale what works.
                </p>
                <div className="flex flex-wrap justify-center gap-3 text-sm text-gray-400">
                  <span className="px-3 py-1.5 bg-gray-800 rounded-full">Prada → Aje</span>
                  <span className="px-3 py-1.5 bg-gray-800 rounded-full">Graff → Goldmark</span>
                  <span className="px-3 py-1.5 bg-gray-800 rounded-full">Nike → Your Brand</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
