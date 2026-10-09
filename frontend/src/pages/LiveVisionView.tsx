import React, { useRef, useEffect, useState } from 'react';
import {
  Eye,
  Target,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Camera,
  Upload,
  Video,
  VideoOff,
  Layers,
  Activity,
} from 'lucide-react';
import {
  Detection,
  VLMStructuredOutput,
  RobotState,
  PerceptionPipelineStatus,
} from '../types/robotics';
import { api } from '../services/api';

interface LiveVisionViewProps {
  detections: Detection[];
  vlmReasoning: VLMStructuredOutput | null;
  robot: RobotState;
  pipelineStatus?: PerceptionPipelineStatus | null;
  cameraFrame?: string | null;
  depthPreview?: string | null;
}

export const LiveVisionView: React.FC<LiveVisionViewProps> = ({
  detections,
  vlmReasoning,
  robot,
  pipelineStatus,
  cameraFrame,
  depthPreview,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRunningStep, setIsRunningStep] = useState(false);
  const [stepTrace, setStepTrace] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'rgb' | 'depth' | 'split'>('rgb');

  // Active perception input source: 'simulated' | 'webcam' | 'upload'
  const [activeInputMode, setActiveInputMode] = useState<'simulated' | 'webcam' | 'upload'>('simulated');
  const [webcamActive, setWebcamActive] = useState<boolean>(false);
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [realCvDetections, setRealCvDetections] = useState<any[]>([]);
  const [cvProcessing, setCvProcessing] = useState<boolean>(false);

  const isFallback = pipelineStatus?.is_fallback ?? true;

  // Active source determination for UI labels (Section 7)
  const getActiveSourceLabel = () => {
    if (activeInputMode === 'webcam') return 'WEBCAM MODE (Actual OpenCV Computer Vision)';
    if (activeInputMode === 'upload') return 'UPLOADED IMAGE (Actual OpenCV Computer Vision)';
    if (!isFallback) return 'MODEL-BASED DETECTION (ONNX Runtime CPU YOLOv8)';
    return 'SIMULATED PERCEPTION [PERCEPTION FALLBACK] (Pinhole Depth Fusion)';
  };

  const getSourceBadgeColor = () => {
    if (activeInputMode === 'webcam' || activeInputMode === 'upload') {
      return 'bg-purple-950/80 text-purple-300 border-purple-600';
    }
    if (!isFallback) {
      return 'bg-cyan-950/80 text-cyan-300 border-cyan-600';
    }
    return 'bg-amber-950/80 text-amber-300 border-amber-600';
  };

  // Start / Stop Webcam
  const handleToggleWebcam = async () => {
    if (webcamActive) {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      setWebcamActive(false);
      setActiveInputMode('simulated');
      setRealCvDetections([]);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setWebcamActive(true);
        setActiveInputMode('webcam');
        setUploadedImageSrc(null);
      } catch (err: any) {
        alert(`Cannot access webcam: ${err.message || 'Permission denied or no camera device found.'}`);
      }
    }
  };

  // Handle image file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setUploadedImageSrc(base64);
      setActiveInputMode('upload');
      if (webcamActive) handleToggleWebcam(); // stop webcam if running

      // Process uploaded image with real OpenCV
      setCvProcessing(true);
      try {
        const res = await api.detectUploadedFrame(base64, 'upload');
        setRealCvDetections(res.detections || []);
      } catch (err) {
        console.error('OpenCV detection error:', err);
      } finally {
        setCvProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Periodic frame capture in Webcam mode
  useEffect(() => {
    if (!webcamActive || activeInputMode !== 'webcam') return;

    const captureInterval = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      const offCanvas = document.createElement('canvas');
      offCanvas.width = 640;
      offCanvas.height = 480;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) return;

      offCtx.drawImage(videoRef.current, 0, 0, 640, 480);
      const b64 = offCanvas.toDataURL('image/jpeg', 0.8);

      try {
        const res = await api.detectUploadedFrame(b64, 'webcam');
        setRealCvDetections(res.detections || []);
      } catch (e) {
        // network or decode error
      }
    }, 600); // 1.6 Hz live detection on webcam

    return () => clearInterval(captureInterval);
  }, [webcamActive, activeInputMode]);

  // Determine active detections list for display
  const displayDetections =
    activeInputMode === 'simulated' ? detections : realCvDetections;

  // Render synthetic camera stream or uploaded frame onto 2D canvas with perspective & bounding boxes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const renderOverlay = () => {
      // Tactical Crosshair in center
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 25, height / 2);
      ctx.lineTo(width / 2 + 25, height / 2);
      ctx.moveTo(width / 2, height / 2 - 25);
      ctx.lineTo(width / 2, height / 2 + 25);
      ctx.stroke();

      // Precision Reticle Circle
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 12, 0, Math.PI * 2);
      ctx.stroke();

      // Render Detected Objects & Bounding Boxes
      displayDetections.forEach((det) => {
        const bx = det.bbox.x * width;
        const by = det.bbox.y * height;
        const bw = det.bbox.width * width;
        const bh = det.bbox.height * height;

        const isTarget = det.is_target;
        const isPerson = det.class_name === 'person';

        const strokeColor = isTarget
          ? '#38bdf8' // Cyan-blue for Target
          : isPerson
          ? '#f97316' // Orange for Person
          : '#10b981'; // Emerald for standard obstacle

        if (isPerson) {
          ctx.fillStyle = 'rgba(249, 115, 22, 0.22)';
          ctx.fillRect(bx, by, bw, bh);
        } else {
          ctx.fillStyle = isTarget ? 'rgba(56, 189, 248, 0.22)' : 'rgba(16, 185, 129, 0.18)';
          ctx.fillRect(bx, by, bw, bh);
        }

        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isTarget ? 3 : 2;
        ctx.strokeRect(bx, by, bw, bh);

        // Corner Accents
        const cornerLen = Math.min(14, bw * 0.25);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(bx, by + cornerLen);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + cornerLen, by);
        ctx.moveTo(bx + bw - cornerLen, by);
        ctx.lineTo(bx + bw, by);
        ctx.lineTo(bx + bw, by + cornerLen);
        ctx.moveTo(bx, by + bh - cornerLen);
        ctx.lineTo(bx, by + bh);
        ctx.lineTo(bx + cornerLen, by + bh);
        ctx.moveTo(bx + bw - cornerLen, by + bh);
        ctx.lineTo(bx + bw, by + bh);
        ctx.lineTo(bx + bw, by + bh - cornerLen);
        ctx.stroke();

        // Top Tag Label Banner
        const labelText = `${det.class_name.toUpperCase()} ${(det.confidence * 100).toFixed(0)}%`;
        const idText = `${det.distance ? det.distance.toFixed(1) + 'm' : ''} | ${det.track_id || 'ID-01'}`;

        ctx.fillStyle = isTarget ? '#0369a1' : isPerson ? '#c2410c' : '#047857';
        ctx.fillRect(bx, Math.max(0, by - 26), Math.max(bw, 160), 24);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(labelText, bx + 5, Math.max(14, by - 12));

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '10px monospace';
        ctx.fillText(idText, bx + 5, Math.max(22, by - 3));

        if (isTarget) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(bx + bw - 60, Math.max(0, by - 26), 60, 24);
          ctx.fillStyle = '#032c4d';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('TARGET', bx + bw - 52, Math.max(14, by - 10));
        }
      });

      // Camera Frame Stamp
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(10, 10, 480, 28);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(
        `AI PERCEPTION | SOURCE: ${activeInputMode.toUpperCase()} | POS: (${robot.pose.x.toFixed(1)}, ${robot.pose.y.toFixed(1)})`,
        18,
        28
      );
    };

    if (activeInputMode === 'upload' && uploadedImageSrc) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        renderOverlay();
      };
      img.src = uploadedImageSrc;
    } else if (activeInputMode === 'simulated' && cameraFrame) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        renderOverlay();
      };
      img.src = cameraFrame;
    } else if (activeInputMode !== 'webcam') {
      // Perspective Floor Background
      ctx.fillStyle = '#060911';
      ctx.fillRect(0, 0, width, height * 0.45);
      const floorGrad = ctx.createLinearGradient(0, height * 0.45, 0, height);
      floorGrad.addColorStop(0, '#151e32');
      floorGrad.addColorStop(1, '#090e1a');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, height * 0.45, width, height * 0.55);
      renderOverlay();
    }
  }, [displayDetections, cameraFrame, uploadedImageSrc, activeInputMode, robot.pose.x, robot.pose.y]);

  const handleRunPipelineStep = async () => {
    setIsRunningStep(true);
    try {
      const res = await api.runPerceptionPipeline();
      setStepTrace(res);
    } catch (e) {
      console.error('Failed to trigger pipeline step:', e);
    } finally {
      setIsRunningStep(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans select-none">
      {/* 1. Header with Controls & Input Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <Eye className="w-5 h-5 text-cyan-400" />
            AI Computer Vision & Perception Pipeline
          </h2>
          <p className="text-xs text-slate-400">
            Perception Stack: Frame Acquisition ➔ Preprocessing ➔ Object Detection ➔ Tracking ➔ Spatial Estimation ➔ Scene Understanding
          </p>
        </div>

        {/* Input Source Buttons & Webcam Toggle */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Simulated Mode Button */}
          <button
            onClick={() => {
              if (webcamActive) handleToggleWebcam();
              setActiveInputMode('simulated');
              setUploadedImageSrc(null);
            }}
            className={`px-2.5 py-1.5 rounded transition cursor-pointer border flex items-center gap-1.5 ${
              activeInputMode === 'simulated'
                ? 'bg-cyan-950 text-cyan-300 font-bold border-cyan-600 shadow'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Simulated Robot Optic</span>
          </button>

          {/* Webcam Live Test Button */}
          <button
            onClick={handleToggleWebcam}
            className={`px-2.5 py-1.5 rounded transition cursor-pointer border flex items-center gap-1.5 ${
              webcamActive
                ? 'bg-red-950 text-red-300 font-bold border-red-600 animate-pulse'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Connect your physical webcam to run real OpenCV object detection"
          >
            {webcamActive ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
            <span>{webcamActive ? 'Stop Webcam' : 'Webcam Live Test'}</span>
          </button>

          {/* Upload Image Test Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`px-2.5 py-1.5 rounded transition cursor-pointer border flex items-center gap-1.5 ${
              activeInputMode === 'upload'
                ? 'bg-purple-950 text-purple-300 font-bold border-purple-600 shadow'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
            }`}
            title="Upload any image file to run OpenCV color and contour detection"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Image Test</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          <button
            onClick={handleRunPipelineStep}
            disabled={isRunningStep}
            className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-1.5 transition cursor-pointer shadow"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningStep ? 'animate-spin' : ''}`} />
            <span>Run Pipeline Trace</span>
          </button>
        </div>
      </div>

      {/* 2. Clearly Labeled Active Source Indicator Banner (Section 7 & 16) */}
      <div className={`p-3 rounded-lg border text-xs font-mono flex items-center justify-between gap-2 shadow ${getSourceBadgeColor()}`}>
        <div className="flex items-center gap-2 font-bold">
          <Activity className="w-4 h-4 shrink-0 animate-pulse" />
          <span>ACTIVE PERCEPTION SOURCE: {getActiveSourceLabel()}</span>
        </div>
        <div className="flex items-center gap-2">
          {cvProcessing && (
            <span className="text-[11px] text-purple-300 animate-pulse">
              OpenCV processing frame...
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-950/80 border border-current uppercase">
            {activeInputMode.toUpperCase()}
          </span>
        </div>
      </div>

      {/* 3. 7-Stage Perception Pipeline Architecture Diagram */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 text-center text-[10px] font-mono">
        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex flex-col justify-center">
          <span className="text-cyan-400 font-bold">1. Camera Input</span>
          <span className="text-[9px] text-slate-500">
            {activeInputMode === 'webcam' ? 'Webcam Stream' : activeInputMode === 'upload' ? 'Uploaded Frame' : 'Simulated 20 FPS'}
          </span>
        </div>
        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex flex-col justify-center">
          <span className="text-cyan-400 font-bold">2. Preprocessing</span>
          <span className="text-[9px] text-slate-500">640x480 Letterbox</span>
        </div>
        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex flex-col justify-center">
          <span className="text-cyan-400 font-bold">3. Object Detector</span>
          <span className="text-[9px] text-amber-400">
            {activeInputMode !== 'simulated' ? 'OpenCV Color & Edge' : isFallback ? 'Geometric Projector' : 'ONNX YOLOv8'}
          </span>
        </div>
        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex flex-col justify-center">
          <span className="text-cyan-400 font-bold">4. BBoxes & Conf</span>
          <span className="text-[9px] text-slate-500">{displayDetections.length} Objects</span>
        </div>
        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex flex-col justify-center">
          <span className="text-cyan-400 font-bold">5. Object Tracking</span>
          <span className="text-[9px] text-slate-500">IoU Centroid Filter</span>
        </div>
        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex flex-col justify-center">
          <span className="text-cyan-400 font-bold">6. Metric Distance</span>
          <span className="text-[9px] text-slate-500">Pinhole Optics Fusion</span>
        </div>
        <div className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex flex-col justify-center col-span-2 sm:col-span-1">
          <span className="text-cyan-400 font-bold">7. World Model</span>
          <span className="text-[9px] text-slate-500">Costmap Integration</span>
        </div>
      </div>

      {/* 4. Main Camera Viewports */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Optical RGB / Video Viewport */}
        <div className="relative w-full aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-xl">
          {activeInputMode === 'webcam' ? (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Overlaid bounding boxes for webcam */}
              <div className="absolute inset-0 pointer-events-none">
                {realCvDetections.map((det) => (
                  <div
                    key={det.track_id}
                    className="absolute border-2 border-cyan-400 bg-cyan-500/10"
                    style={{
                      left: `${det.bbox.x * 100}%`,
                      top: `${det.bbox.y * 100}%`,
                      width: `${det.bbox.width * 100}%`,
                      height: `${det.bbox.height * 100}%`,
                    }}
                  >
                    <div className="bg-cyan-600 text-white font-mono text-[9px] px-1 py-0.5 inline-block font-bold">
                      {det.class_name.toUpperCase()} ({(det.confidence * 100).toFixed(0)}%)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <canvas ref={canvasRef} width={1280} height={720} className="w-full h-full object-cover" />
          )}

          {/* Detections Horizontal Scroll Strip */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 overflow-x-auto py-1 font-mono">
            {displayDetections.length === 0 ? (
              <div className="px-3 py-1.5 rounded bg-slate-950/85 text-slate-400 border border-slate-800 text-xs">
                No objects in active camera FOV
              </div>
            ) : (
              displayDetections.map((det) => (
                <div
                  key={det.track_id}
                  className={`px-2.5 py-1 rounded text-xs shrink-0 border flex items-center gap-2 backdrop-blur shadow ${
                    det.is_target
                      ? 'bg-blue-950/85 border-blue-500 text-blue-200'
                      : det.class_name === 'person'
                      ? 'bg-orange-950/85 border-orange-500 text-orange-200'
                      : 'bg-slate-900/85 border-slate-700 text-slate-200'
                  }`}
                >
                  <span className="font-bold uppercase">{det.class_name}</span>
                  <span className="text-slate-400">{(det.confidence * 100).toFixed(0)}%</span>
                  {det.distance && (
                    <span className="font-semibold text-cyan-300">{det.distance.toFixed(1)}m</span>
                  )}
                  {det.is_target && (
                    <span className="px-1 py-0.2 rounded bg-blue-600 text-white text-[9px] font-bold">
                      TARGET
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Depth Buffer or Pipeline Diagnostics */}
        <div className="relative w-full aspect-video bg-slate-950 rounded-lg overflow-hidden border border-slate-800 shadow-xl flex items-center justify-center">
          {depthPreview ? (
            <img src={depthPreview} alt="Depth Buffer Scan" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center p-4 text-slate-500 font-mono text-xs">
              <Camera className="w-6 h-6 mx-auto mb-2 text-cyan-400 animate-pulse" />
              <span>Depth Buffer Telemetry Available in Simulation Mode</span>
            </div>
          )}

          <div className="absolute top-3 left-3 px-2 py-1 rounded bg-slate-950/80 border border-slate-700 text-cyan-300 text-xs font-mono font-bold">
            DEPTH BUFFER COLORMAP (0.2m - 10.0m)
          </div>
        </div>
      </div>

      {/* 5. Complete Detections Table (Section 7) */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2 font-mono">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase">
            <Target className="w-4 h-4 text-cyan-400" />
            <span>Detections Registry ({displayDetections.length} entities in view)</span>
          </div>
          <span className="text-[11px] text-slate-400">
            Classes: person, box, chair, table, shelf, bottle, backpack, laptop, door, obstacle
          </span>
        </div>

        {displayDetections.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            No entities currently identified in visual field of view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase">
                  <th className="py-2 px-2.5">Track ID</th>
                  <th className="py-2 px-2.5">Class</th>
                  <th className="py-2 px-2.5">Confidence</th>
                  <th className="py-2 px-2.5">Distance</th>
                  <th className="py-2 px-2.5">Bounding Box [x, y, w, h]</th>
                  <th className="py-2 px-2.5">Source Engine</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {displayDetections.map((det, idx) => (
                  <tr key={det.track_id || idx} className="hover:bg-slate-900/60 transition">
                    <td className="py-2 px-2.5 font-bold text-cyan-300">{det.track_id || `ID-${idx + 1}`}</td>
                    <td className="py-2 px-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          det.is_target
                            ? 'bg-blue-900 text-blue-200'
                            : det.class_name === 'person'
                            ? 'bg-orange-900 text-orange-200'
                            : 'bg-slate-800 text-slate-200'
                        }`}
                      >
                        {det.class_name}
                      </span>
                    </td>
                    <td className="py-2 px-2.5">{(det.confidence * 100).toFixed(0)}%</td>
                    <td className="py-2 px-2.5 font-semibold text-emerald-400">
                      {det.distance ? `${det.distance.toFixed(2)} m` : '--'}
                    </td>
                    <td className="py-2 px-2.5 text-[10px] text-slate-400">
                      [{det.bbox.x.toFixed(2)}, {det.bbox.y.toFixed(2)}, {det.bbox.width.toFixed(2)},{' '}
                      {det.bbox.height.toFixed(2)}]
                    </td>
                    <td className="py-2 px-2.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900 border border-slate-700 text-slate-300">
                        {det.model_source || (activeInputMode !== 'simulated' ? 'OpenCV' : isFallback ? 'FALLBACK' : 'ONNX')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 6. Vision-Language Reasoning Card */}
      {vlmReasoning && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Vision-Language Scene Understanding & Spatial Reasoning</span>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              Recommended: <strong className="text-emerald-300">{vlmReasoning.recommended_action}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-500 font-mono uppercase">Scene Description</div>
              <p className="text-slate-200 leading-relaxed font-sans">{vlmReasoning.scene_summary}</p>
            </div>

            <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
              <div className="text-[10px] text-slate-500 font-mono uppercase">Spatial Reasoning & Pose</div>
              <p className="text-slate-200 leading-relaxed font-sans">{vlmReasoning.spatial_reasoning}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveVisionView;
