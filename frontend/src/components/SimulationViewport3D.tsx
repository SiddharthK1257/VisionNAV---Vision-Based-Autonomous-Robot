import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  RobotState,
  NavigationStatus,
  StaticObstacle,
  DynamicObstacle,
  TargetLocation,
  LiDARHit,
  EnvironmentType,
  Detection,
  VLMStructuredOutput,
} from '../types/robotics';
import {
  Camera,
  Eye,
  Maximize2,
  Minimize2,
  RotateCcw,
  Target,
  Compass,
  AlertTriangle,
  Radio,
} from 'lucide-react';

interface SimulationViewport3DProps {
  robot: RobotState;
  navigation: NavigationStatus;
  staticObstacles: StaticObstacle[];
  dynamicObstacles: DynamicObstacle[];
  targets: TargetLocation[];
  activeTarget: string | null;
  lidarRays: LiDARHit[];
  environment: EnvironmentType;
  detections?: Detection[];
  vlmReasoning?: VLMStructuredOutput | null;
  cameraFrame?: string | null;
  depthPreview?: string | null;
  onNavigateToTab?: (tabId: string) => void;
}

export const SimulationViewport3D: React.FC<SimulationViewport3DProps> = ({
  robot,
  navigation,
  staticObstacles,
  dynamicObstacles,
  targets,
  activeTarget,
  lidarRays,
  environment,
  detections = [],
  vlmReasoning,
  cameraFrame,
  depthPreview,
  onNavigateToTab,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  // Viewport display toggles
  const [cameraMode, setCameraMode] = useState<'orbit' | 'top_down' | 'chase'>('orbit');
  const [showLidar, setShowLidar] = useState<boolean>(true);
  const [showPath, setShowPath] = useState<boolean>(true);
  const [showFrustum, setShowFrustum] = useState<boolean>(true);
  const [showBreadcrumbs, setShowBreadcrumbs] = useState<boolean>(true);

  // Picture-in-Picture (PiP) Camera Panel
  const [showPip, setShowPip] = useState<boolean>(true);
  const [pipMode, setPipMode] = useState<'rgb' | 'depth'>('rgb');
  const [pipMinimized, setPipMinimized] = useState<boolean>(false);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  const robotMeshGroup = useRef<THREE.Group | null>(null);
  const lidarTurretRef = useRef<THREE.Mesh | null>(null);
  const footPrintRingRef = useRef<THREE.Mesh | null>(null);
  const cameraFrustumRef = useRef<THREE.LineSegments | null>(null);
  const obstaclesGroup = useRef<THREE.Group | null>(null);
  const dynamicObstaclesGroup = useRef<THREE.Group | null>(null);
  const targetBeaconGroup = useRef<THREE.Group | null>(null);
  const pathLineRef = useRef<THREE.Line | null>(null);
  const pathPointsGroup = useRef<THREE.Group | null>(null);
  const lidarLineSegmentsRef = useRef<THREE.LineSegments | null>(null);
  const breadcrumbPointsRef = useRef<THREE.Points | null>(null);

  // Breadcrumb history buffer (keeps last 80 positions)
  const historyCoords = useRef<[number, number][]>([]);

  // Orbit controls state
  const isMouseDown = useRef(false);
  const mousePos = useRef({ x: 0, y: 0 });
  const spherical = useRef({ radius: 22, phi: Math.PI / 3.2, theta: Math.PI / 4.2 });
  const cameraCenter = useRef(new THREE.Vector3(10, 0, 7));

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene & Environment Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060911);
    scene.fog = new THREE.FogExp2(0x060911, 0.022);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 120);
    cameraRef.current = camera;

    // 3. Renderer with soft shadows
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting Suite (Technical ground station atmosphere)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    // Primary cyan overhead key light
    const keyLight = new THREE.DirectionalLight(0x06b6d4, 1.4);
    keyLight.position.set(12, 22, 10);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 40;
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 16;
    keyLight.shadow.camera.bottom = -16;
    scene.add(keyLight);

    // Warm amber fill light
    const fillLight = new THREE.DirectionalLight(0xf59e0b, 0.5);
    fillLight.position.set(-10, 15, -8);
    scene.add(fillLight);

    // Cool rim light
    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    rimLight.position.set(5, 8, 20);
    scene.add(rimLight);

    // 5. Floor & Precision Navigation Grid
    const gridMajor = new THREE.GridHelper(30, 30, 0x06b6d4, 0x1e293b);
    gridMajor.position.set(10, 0.001, 7);
    scene.add(gridMajor);

    const gridSub = new THREE.GridHelper(30, 150, 0x0e7490, 0x0f172a);
    gridSub.position.set(10, 0.0005, 7);
    scene.add(gridSub);

    const floorGeo = new THREE.PlaneGeometry(32, 26);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x090e1a,
      roughness: 0.85,
      metalness: 0.15,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(10, 0, 7);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Floor Boundary Border
    const boundaryGeo = new THREE.BoxGeometry(20.4, 0.05, 14.4);
    const boundaryEdges = new THREE.EdgesGeometry(boundaryGeo);
    const boundaryMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2 });
    const boundaryLine = new THREE.LineSegments(boundaryEdges, boundaryMat);
    boundaryLine.position.set(10, 0.02, 7);
    scene.add(boundaryLine);

    // 6. Highly Detailed Differential-Drive AMR Robot Model
    const robotGroup = new THREE.Group();

    // Chassis Base (Dark metallic finish)
    const chassisGeo = new THREE.BoxGeometry(0.65, 0.16, 0.44);
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      metalness: 0.8,
      roughness: 0.25,
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.13;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    robotGroup.add(chassis);

    // Upper Shell with Bevel Cover
    const shellGeo = new THREE.BoxGeometry(0.55, 0.08, 0.38);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      metalness: 0.7,
      roughness: 0.3,
    });
    const shell = new THREE.Mesh(shellGeo, shellMat);
    shell.position.set(-0.02, 0.23, 0);
    shell.castShadow = true;
    robotGroup.add(shell);

    // Cyan Neon Perimeter Trim
    const trimGeo = new THREE.BoxGeometry(0.66, 0.02, 0.45);
    const trimMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.y = 0.16;
    robotGroup.add(trim);

    // Left Drive Wheel (Rubber with metallic hub)
    const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 24);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x030712, roughness: 0.95 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.9, roughness: 0.2 });

    const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
    leftWheel.rotation.x = Math.PI / 2;
    leftWheel.position.set(0, 0.11, 0.235);
    leftWheel.castShadow = true;
    robotGroup.add(leftWheel);

    const leftHub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.062, 16), hubMat);
    leftHub.rotation.x = Math.PI / 2;
    leftHub.position.set(0, 0.11, 0.235);
    robotGroup.add(leftHub);

    // Right Drive Wheel
    const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rightWheel.rotation.x = Math.PI / 2;
    rightWheel.position.set(0, 0.11, -0.235);
    rightWheel.castShadow = true;
    robotGroup.add(rightWheel);

    const rightHub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.062, 16), hubMat);
    rightHub.rotation.x = Math.PI / 2;
    rightHub.position.set(0, 0.11, -0.235);
    robotGroup.add(rightHub);

    // Front & Rear Swivel Caster Wheels
    const casterGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const casterMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 });
    const frontCaster = new THREE.Mesh(casterGeo, casterMat);
    frontCaster.position.set(0.25, 0.04, 0);
    robotGroup.add(frontCaster);

    const rearCaster = new THREE.Mesh(casterGeo, casterMat);
    rearCaster.position.set(-0.25, 0.04, 0);
    robotGroup.add(rearCaster);

    // Rotating 360° LiDAR Mast & Scanner Turret
    const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(0.08, 0.31, 0);
    robotGroup.add(mast);

    const turretGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 20);
    const turretMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      emissive: 0x0284c7,
      emissiveIntensity: 0.4,
      metalness: 0.9,
    });
    const turret = new THREE.Mesh(turretGeo, turretMat);
    turret.position.set(0.08, 0.37, 0);
    robotGroup.add(turret);
    lidarTurretRef.current = turret;

    // Forward Stereo AI Vision Camera Module
    const cameraHousingGeo = new THREE.BoxGeometry(0.06, 0.04, 0.14);
    const cameraHousingMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7 });
    const camHousing = new THREE.Mesh(cameraHousingGeo, cameraHousingMat);
    camHousing.position.set(0.33, 0.22, 0);
    robotGroup.add(camHousing);

    // Dual Optical Lenses (Emissive blue)
    const lensGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.015, 16);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const leftLens = new THREE.Mesh(lensGeo, lensMat);
    leftLens.rotation.z = Math.PI / 2;
    leftLens.position.set(0.36, 0.22, 0.04);
    robotGroup.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeo, lensMat);
    rightLens.rotation.z = Math.PI / 2;
    rightLens.position.set(0.36, 0.22, -0.04);
    robotGroup.add(rightLens);

    // Forward Direction Laser Heading Arrow
    const arrowDir = new THREE.Vector3(1, 0, 0);
    const arrowOrigin = new THREE.Vector3(0.25, 0.05, 0);
    const arrowHelper = new THREE.ArrowHelper(arrowDir, arrowOrigin, 0.75, 0x10b981, 0.2, 0.12);
    robotGroup.add(arrowHelper);

    // Dynamic Ground Safety Footprint Ring
    const footprintGeo = new THREE.RingGeometry(0.48, 0.54, 36);
    const footprintMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
    });
    const footprintRing = new THREE.Mesh(footprintGeo, footprintMat);
    footprintRing.rotation.x = Math.PI / 2;
    footprintRing.position.y = 0.02;
    robotGroup.add(footprintRing);
    footPrintRingRef.current = footprintRing;

    // 3D Camera Field-of-View Visual Frustum (Wireframe cone showing camera sight in space)
    const frustumPoints: THREE.Vector3[] = [];
    const originPoint = new THREE.Vector3(0.36, 0.22, 0);
    const fovDist = 3.2;
    const fovHalfW = Math.tan((40 * Math.PI) / 180) * fovDist;
    const fovHalfH = Math.tan((24 * Math.PI) / 180) * fovDist;

    const cornerTL = new THREE.Vector3(0.36 + fovDist, 0.22 + fovHalfH, fovHalfW);
    const cornerTR = new THREE.Vector3(0.36 + fovDist, 0.22 + fovHalfH, -fovHalfW);
    const cornerBR = new THREE.Vector3(0.36 + fovDist, 0.22 - fovHalfH, -fovHalfW);
    const cornerBL = new THREE.Vector3(0.36 + fovDist, 0.22 - fovHalfH, fovHalfW);

    // 4 pyramid lines from origin
    frustumPoints.push(originPoint, cornerTL);
    frustumPoints.push(originPoint, cornerTR);
    frustumPoints.push(originPoint, cornerBR);
    frustumPoints.push(originPoint, cornerBL);
    // 4 base lines
    frustumPoints.push(cornerTL, cornerTR);
    frustumPoints.push(cornerTR, cornerBR);
    frustumPoints.push(cornerBR, cornerBL);
    frustumPoints.push(cornerBL, cornerTL);

    const frustumGeo = new THREE.BufferGeometry().setFromPoints(frustumPoints);
    const frustumMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    const cameraFrustum = new THREE.LineSegments(frustumGeo, frustumMat);
    robotGroup.add(cameraFrustum);
    cameraFrustumRef.current = cameraFrustum;

    scene.add(robotGroup);
    robotMeshGroup.current = robotGroup;

    // 7. Environment Object Groups
    const obsGroup = new THREE.Group();
    scene.add(obsGroup);
    obstaclesGroup.current = obsGroup;

    const dynGroup = new THREE.Group();
    scene.add(dynGroup);
    dynamicObstaclesGroup.current = dynGroup;

    const tgtGroup = new THREE.Group();
    scene.add(tgtGroup);
    targetBeaconGroup.current = tgtGroup;

    // 8. Planned Route Lines & Waypoints
    const pathMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      linewidth: 3,
      transparent: true,
      opacity: 0.85,
    });
    const pathGeo = new THREE.BufferGeometry();
    const pathLine = new THREE.Line(pathGeo, pathMat);
    scene.add(pathLine);
    pathLineRef.current = pathLine;

    const wpGroup = new THREE.Group();
    scene.add(wpGroup);
    pathPointsGroup.current = wpGroup;

    // 9. LiDAR Laser Beam Segments
    const lidarMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
    });
    const lidarGeo = new THREE.BufferGeometry();
    const lidarLines = new THREE.LineSegments(lidarGeo, lidarMat);
    scene.add(lidarLines);
    lidarLineSegmentsRef.current = lidarLines;

    // 10. Historic Breadcrumb Trail Points
    const breadcrumbGeo = new THREE.BufferGeometry();
    const breadcrumbMat = new THREE.PointsMaterial({
      color: 0x06b6d4,
      size: 0.08,
      transparent: true,
      opacity: 0.7,
    });
    const breadcrumbPoints = new THREE.Points(breadcrumbGeo, breadcrumbMat);
    scene.add(breadcrumbPoints);
    breadcrumbPointsRef.current = breadcrumbPoints;

    // 11. Mouse & Orbit Interaction Listeners
    const onMouseDown = (e: MouseEvent) => {
      isMouseDown.current = true;
      mousePos.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isMouseDown.current) return;
      const dx = e.clientX - mousePos.current.x;
      const dy = e.clientY - mousePos.current.y;
      mousePos.current = { x: e.clientX, y: e.clientY };

      spherical.current.theta -= dx * 0.007;
      spherical.current.phi = Math.max(0.12, Math.min(Math.PI / 2.05, spherical.current.phi - dy * 0.007));
    };

    const onMouseUp = () => {
      isMouseDown.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.current.radius = Math.max(6, Math.min(42, spherical.current.radius + e.deltaY * 0.02));
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Handle Window Resize
    const onResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // 12. Main 60 FPS Render & Animation Loop
    let animId: number;
    let timeTick = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      timeTick += 0.035;

      // Spin LiDAR sensor turret continuously
      if (lidarTurretRef.current) {
        lidarTurretRef.current.rotation.y += 0.08;
      }

      // Dynamic Camera Positioning based on mode
      const s = spherical.current;
      const targetLook = cameraCenter.current;

      if (cameraMode === 'top_down') {
        camera.position.set(targetLook.x, 23, targetLook.z + 0.001);
        camera.lookAt(targetLook.x, 0, targetLook.z);
      } else if (cameraMode === 'chase' && robotMeshGroup.current) {
        const robPos = robotMeshGroup.current.position;
        const robRot = robotMeshGroup.current.rotation.y;
        const chaseDist = 3.8;
        const chaseHeight = 2.4;
        const chaseX = robPos.x - Math.cos(-robRot) * chaseDist;
        const chaseZ = robPos.z + Math.sin(-robRot) * chaseDist;
        camera.position.set(chaseX, chaseHeight, chaseZ);
        camera.lookAt(robPos.x + Math.cos(-robRot) * 2, 0.6, robPos.z - Math.sin(-robRot) * 2);
      } else {
        // Orbit mode smoothly orbiting around target center
        const cx = targetLook.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta);
        const cy = targetLook.y + s.radius * Math.cos(s.phi);
        const cz = targetLook.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta);
        camera.position.set(cx, cy, cz);
        camera.lookAt(targetLook);
      }

      // Animate Target Hologram Rings & Beacons
      if (targetBeaconGroup.current) {
        targetBeaconGroup.current.children.forEach((child) => {
          const ring = child.getObjectByName('pulse_ring');
          if (ring) {
            const scale = 1.0 + Math.sin(timeTick * 2.8) * 0.25;
            ring.scale.set(scale, 1, scale);
          }
          const pillar = child.getObjectByName('light_pillar');
          if (pillar && pillar instanceof THREE.Mesh) {
            pillar.material.opacity = 0.35 + Math.sin(timeTick * 2.0) * 0.15;
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [cameraMode]);

  // Update Robot Pose & Footprint Safety Ring
  useEffect(() => {
    if (!robotMeshGroup.current) return;
    // Map coordinate system: (x -> X, y -> Z)
    robotMeshGroup.current.position.set(robot.pose.x, 0, robot.pose.y);
    robotMeshGroup.current.rotation.y = -robot.pose.theta;

    // Dynamically color ground footprint ring based on obstacle proximity
    if (footPrintRingRef.current) {
      const nearest = lidarRays.length > 0 ? Math.min(...lidarRays.map((r) => r.distance)) : 999;
      const mat = footPrintRingRef.current.material as THREE.MeshBasicMaterial;
      if (nearest < 0.55 || robot.emergency_stop) {
        mat.color.setHex(0xef4444); // Red: danger / e-stop
        mat.opacity = 0.9;
      } else if (nearest < 1.2 || navigation.state === 'OBSTACLE_DETECTED' || navigation.state === 'REPLANNING') {
        mat.color.setHex(0xf59e0b); // Amber: warning
        mat.opacity = 0.8;
      } else {
        mat.color.setHex(0x06b6d4); // Cyan: nominal
        mat.opacity = 0.65;
      }
    }

    // Toggle camera frustum visibility
    if (cameraFrustumRef.current) {
      cameraFrustumRef.current.visible = showFrustum;
    }

    // Record breadcrumb point
    const hist = historyCoords.current;
    if (
      hist.length === 0 ||
      Math.hypot(robot.pose.x - hist[hist.length - 1][0], robot.pose.y - hist[hist.length - 1][1]) > 0.25
    ) {
      hist.push([robot.pose.x, robot.pose.y]);
      if (hist.length > 90) hist.shift();

      if (breadcrumbPointsRef.current && showBreadcrumbs) {
        const pts: THREE.Vector3[] = hist.map(([hx, hy]) => new THREE.Vector3(hx, 0.04, hy));
        breadcrumbPointsRef.current.geometry.setFromPoints(pts);
      }
    }
  }, [robot.pose, robot.emergency_stop, lidarRays, navigation.state, showFrustum, showBreadcrumbs]);

  // Update Static Obstacles with Shelves & Warehouse Detailing
  useEffect(() => {
    if (!obstaclesGroup.current) return;
    const group = obstaclesGroup.current;
    group.clear();

    staticObstacles.forEach((obs) => {
      const isWall = obs.class_name === 'wall';
      const isPlacedCrate = obs.attribute === 'unexpected_block' || obs.id.includes('placed_obs');
      const height = isWall ? 2.6 : isPlacedCrate ? 1.0 : 1.4;

      if (isPlacedCrate) {
        // High-visibility orange/yellow unexpected hazard crate
        const crateGroup = new THREE.Group();
        crateGroup.position.set(obs.x, 0, obs.y);

        const geo = new THREE.BoxGeometry(obs.width, height, obs.height);
        const mat = new THREE.MeshStandardMaterial({
          color: 0xd97706,
          metalness: 0.3,
          roughness: 0.6,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = height / 2;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        crateGroup.add(mesh);

        // Warning striped border
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xfef08a, linewidth: 2 }));
        line.position.y = height / 2;
        crateGroup.add(line);

        // Ground danger projection circle
        const ringGeo = new THREE.RingGeometry(obs.width * 0.7, obs.width * 0.85, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.03;
        crateGroup.add(ring);

        group.add(crateGroup);
      } else if (obs.class_name === 'table' || obs.class_name === 'inspection_table') {
        // Staging / QA Table with legs
        const tableGroup = new THREE.Group();
        tableGroup.position.set(obs.x, 0, obs.y);

        // Top tabletop
        const topGeo = new THREE.BoxGeometry(obs.width, 0.08, obs.height);
        const topMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.3 });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = 1.1;
        top.castShadow = true;
        tableGroup.add(top);

        // Legs
        const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
        const offsets = [
          [-obs.width / 2 + 0.1, -obs.height / 2 + 0.1],
          [obs.width / 2 - 0.1, -obs.height / 2 + 0.1],
          [-obs.width / 2 + 0.1, obs.height / 2 - 0.1],
          [obs.width / 2 - 0.1, obs.height / 2 - 0.1],
        ];
        offsets.forEach(([ox, oz]) => {
          const leg = new THREE.Mesh(legGeo, legMat);
          leg.position.set(ox, 0.55, oz);
          leg.castShadow = true;
          tableGroup.add(leg);
        });

        group.add(tableGroup);
      } else {
        // Warehouse Pallet Shelf or Perimeter Wall
        const geo = new THREE.BoxGeometry(obs.width, height, obs.height);
        const mat = new THREE.MeshStandardMaterial({
          color: isWall ? 0x1e293b : 0x334155,
          roughness: 0.7,
          metalness: 0.25,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(obs.x, height / 2, obs.y);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // Accent edge wireframe for clean industrial look
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x475569, linewidth: 1 }));
        line.position.set(obs.x, height / 2, obs.y);
        group.add(line);
      }
    });
  }, [staticObstacles]);

  // Update Dynamic Obstacles (Pedestrians / Autonomous Forklifts)
  useEffect(() => {
    if (!dynamicObstaclesGroup.current) return;
    const group = dynamicObstaclesGroup.current;
    group.clear();

    dynamicObstacles.forEach((dyn) => {
      const humanGroup = new THREE.Group();
      humanGroup.position.set(dyn.x, 0, dyn.y);

      // Torso / High-vis vest
      const torsoGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.82, 16);
      const torsoMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.7 });
      const torso = new THREE.Mesh(torsoGeo, torsoMat);
      torso.position.y = 0.95;
      torso.castShadow = true;
      humanGroup.add(torso);

      // Reflective safety belt
      const beltGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.08, 16);
      const beltMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
      const belt = new THREE.Mesh(beltGeo, beltMat);
      belt.position.y = 0.95;
      humanGroup.add(belt);

      // Head & Hardhat
      const headGeo = new THREE.SphereGeometry(0.16, 16, 16);
      const headMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3 });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.y = 1.52;
      head.castShadow = true;
      humanGroup.add(head);

      // Dynamic obstacle safety zone ring
      const circleGeo = new THREE.RingGeometry(dyn.radius * 0.95, dyn.radius * 1.15, 32);
      const circleMat = new THREE.MeshBasicMaterial({
        color: 0xf97316,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
      });
      const circle = new THREE.Mesh(circleGeo, circleMat);
      circle.rotation.x = Math.PI / 2;
      circle.position.y = 0.03;
      humanGroup.add(circle);

      group.add(humanGroup);
    });
  }, [dynamicObstacles]);

  // Update Target Beacons with Holographic Light Pillars
  useEffect(() => {
    if (!targetBeaconGroup.current) return;
    const group = targetBeaconGroup.current;
    group.clear();

    targets.forEach((tgt) => {
      const isTargetActive =
        tgt.name === activeTarget ||
        (tgt.attribute === 'blue' && activeTarget?.includes('Blue')) ||
        tgt.id === 'tgt_scenario_b';

      const beaconGroup = new THREE.Group();
      beaconGroup.position.set(tgt.x, 0, tgt.y);

      // Base Pedestal
      const cylGeo = new THREE.CylinderGeometry(0.3, 0.34, 0.45, 20);
      const cylMat = new THREE.MeshStandardMaterial({
        color: isTargetActive ? 0x1d4ed8 : 0x047857,
        emissive: isTargetActive ? 0x2563eb : 0x059669,
        emissiveIntensity: 0.7,
        metalness: 0.7,
      });
      const cyl = new THREE.Mesh(cylGeo, cylMat);
      cyl.position.y = 0.22;
      cyl.castShadow = true;
      beaconGroup.add(cyl);

      // Holographic Light Pillar Beam
      const pillarGeo = new THREE.CylinderGeometry(0.12, 0.28, 4.5, 16);
      const pillarMat = new THREE.MeshBasicMaterial({
        color: isTargetActive ? 0x38bdf8 : 0x34d399,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.name = 'light_pillar';
      pillar.position.y = 2.4;
      beaconGroup.add(pillar);

      // Pulsing Floor Ring
      const ringGeo = new THREE.RingGeometry(0.45, 0.65, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: isTargetActive ? 0x38bdf8 : 0x34d399,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.name = 'pulse_ring';
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.04;
      beaconGroup.add(ring);

      group.add(beaconGroup);
    });
  }, [targets, activeTarget]);

  // Update Planned Path Line & Waypoint Markers
  useEffect(() => {
    if (!pathLineRef.current || !pathPointsGroup.current || !showPath) {
      if (pathLineRef.current) pathLineRef.current.visible = false;
      if (pathPointsGroup.current) pathPointsGroup.current.visible = false;
      return;
    }

    const waypoints = navigation.path?.waypoints || [];
    if (waypoints.length === 0) {
      pathLineRef.current.visible = false;
      pathPointsGroup.current.visible = false;
      return;
    }

    pathLineRef.current.visible = true;
    pathPointsGroup.current.visible = true;
    pathPointsGroup.current.clear();

    const points: THREE.Vector3[] = [];
    points.push(new THREE.Vector3(robot.pose.x, 0.12, robot.pose.y));

    const remainingWps = waypoints.slice(navigation.current_waypoint_index);
    remainingWps.forEach((wp, idx) => {
      points.push(new THREE.Vector3(wp.x, 0.12, wp.y));

      // Waypoint Disc
      const wpGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16);
      const wpMat = new THREE.MeshBasicMaterial({
        color: idx === 0 ? 0xf59e0b : 0x06b6d4,
      });
      const wpMesh = new THREE.Mesh(wpGeo, wpMat);
      wpMesh.position.set(wp.x, 0.05, wp.y);
      pathPointsGroup.current?.add(wpMesh);
    });

    pathLineRef.current.geometry.setFromPoints(points);
  }, [navigation.path, navigation.current_waypoint_index, robot.pose, showPath]);

  // Update LiDAR Ray Segments
  useEffect(() => {
    if (!lidarLineSegmentsRef.current || !showLidar) {
      if (lidarLineSegmentsRef.current) lidarLineSegmentsRef.current.visible = false;
      return;
    }

    if (!lidarRays || lidarRays.length === 0) {
      lidarLineSegmentsRef.current.visible = false;
      return;
    }

    lidarLineSegmentsRef.current.visible = true;
    const linePoints: THREE.Vector3[] = [];
    const robOrigin = new THREE.Vector3(robot.pose.x, 0.37, robot.pose.y);

    lidarRays.forEach((ray) => {
      linePoints.push(robOrigin);
      linePoints.push(new THREE.Vector3(ray.x, 0.37, ray.y));
    });

    lidarLineSegmentsRef.current.geometry.setFromPoints(linePoints);
  }, [lidarRays, robot.pose, showLidar]);

  // Snap Camera to Robot Center
  const handleSnapToRobot = () => {
    cameraCenter.current.set(robot.pose.x, 0, robot.pose.y);
  };

  const headingDeg = Math.round((robot.pose.theta * 180) / Math.PI);
  const nearestObsDist = lidarRays.length > 0 ? Math.min(...lidarRays.map((r) => r.distance)) : 999;

  return (
    <div className="relative w-full h-full bg-[#060911] select-none overflow-hidden font-mono">
      {/* 3D Canvas Mount */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* 1. TOP-LEFT: Interactive Picture-in-Picture (PiP) AI Camera Panel */}
      {showPip && (
        <div
          className={`absolute top-3 left-3 z-30 transition-all duration-300 rounded-lg overflow-hidden border border-cyan-800/60 shadow-2xl bg-slate-950/90 backdrop-blur-md ${
            pipMinimized ? 'w-48' : 'w-72 sm:w-80'
          }`}
        >
          {/* PiP Header */}
          <div className="px-2.5 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold text-cyan-400">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>FRONT AI CAM</span>
              <span className="text-[9px] px-1 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                {pipMode.toUpperCase()} | {environment.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPipMode(pipMode === 'rgb' ? 'depth' : 'rgb')}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 transition cursor-pointer"
                title="Switch between RGB and Depth Camera"
              >
                {pipMode === 'rgb' ? 'DEPTH' : 'RGB'}
              </button>
              <button
                onClick={() => setPipMinimized(!pipMinimized)}
                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition cursor-pointer"
                title={pipMinimized ? 'Expand' : 'Minimize'}
              >
                {pipMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* PiP Body */}
          {!pipMinimized && (
            <div className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
              {pipMode === 'depth' && depthPreview ? (
                <img src={depthPreview} alt="Depth Buffer" className="w-full h-full object-cover" />
              ) : cameraFrame ? (
                <img src={cameraFrame} alt="RGB Frame" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center p-3 text-slate-500 text-[11px]">
                  <Radio className="w-5 h-5 mx-auto mb-1 animate-pulse text-cyan-400" />
                  <span>Connecting to Sensor Pipeline...</span>
                </div>
              )}

              {/* HUD Crosshair Overlay on PiP */}
              <div className="hud-corner-tl" />
              <div className="hud-corner-tr" />
              <div className="hud-corner-bl" />
              <div className="hud-corner-br" />

              {/* Active Detections Badge Overlay */}
              <div className="absolute top-1.5 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-[9px] text-slate-300 font-bold">
                FOV 80° | {detections.length} DETECTIONS
              </div>

              {detections.find((d) => d.is_target) && (
                <div className="absolute top-1.5 right-2 px-1.5 py-0.5 rounded bg-blue-900/90 border border-blue-500 text-[9px] text-blue-200 font-bold flex items-center gap-1 animate-pulse">
                  <Target className="w-2.5 h-2.5" />
                  <span>TARGET LOCK</span>
                </div>
              )}

              {/* VLM reasoning snippet */}
              {vlmReasoning && (
                <div className="absolute bottom-6 left-2 right-2 bg-slate-950/80 border border-slate-800 rounded px-1.5 py-0.5 text-[9px] text-slate-300 truncate">
                  AI: {vlmReasoning.recommended_action}
                </div>
              )}

              {/* Quick jump to full perception lab */}
              {onNavigateToTab && (
                <button
                  onClick={() => onNavigateToTab('live_vision')}
                  className="absolute bottom-1.5 right-2 px-2 py-0.5 rounded bg-slate-900/90 hover:bg-cyan-600 hover:text-white border border-slate-700 text-[10px] text-cyan-300 transition cursor-pointer flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" />
                  <span>OPEN PERCEPTION LAB</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 2. TOP-RIGHT: Viewport Camera Mode Selector & Layer Toggles */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
        <div className="flex bg-slate-950/90 border border-slate-800 rounded p-1 text-xs font-mono text-slate-300 backdrop-blur-md shadow-lg">
          <button
            onClick={() => setCameraMode('orbit')}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              cameraMode === 'orbit'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                : 'hover:bg-slate-900 text-slate-400'
            }`}
          >
            Orbit 3D
          </button>
          <button
            onClick={() => setCameraMode('top_down')}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              cameraMode === 'top_down'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                : 'hover:bg-slate-900 text-slate-400'
            }`}
          >
            Top-Down 2D
          </button>
          <button
            onClick={() => setCameraMode('chase')}
            className={`px-2.5 py-1 rounded transition cursor-pointer ${
              cameraMode === 'chase'
                ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700/60 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                : 'hover:bg-slate-900 text-slate-400'
            }`}
          >
            Chase Cam
          </button>
        </div>

        {/* Focus / Snap to Robot Button */}
        <button
          onClick={handleSnapToRobot}
          className="p-1.5 rounded bg-slate-950/90 hover:bg-slate-900 border border-slate-800 text-cyan-400 text-xs transition cursor-pointer shadow-lg"
          title="Center Camera Viewport on Robot Pose"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Layer Toggles Pill */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded p-1 text-[11px] backdrop-blur-md shadow-lg">
          <button
            onClick={() => setShowLidar(!showLidar)}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              showLidar ? 'bg-cyan-950/90 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle LiDAR Rays"
          >
            LiDAR
          </button>
          <button
            onClick={() => setShowPath(!showPath)}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              showPath ? 'bg-cyan-950/90 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Planned Trajectory"
          >
            Path
          </button>
          <button
            onClick={() => setShowFrustum(!showFrustum)}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              showFrustum ? 'bg-cyan-950/90 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle 3D Camera FOV Frustum"
          >
            Frustum
          </button>
          <button
            onClick={() => setShowBreadcrumbs(!showBreadcrumbs)}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              showBreadcrumbs ? 'bg-cyan-950/90 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle Historic Odometry Breadcrumb Trail"
          >
            Trail
          </button>
          <button
            onClick={() => setShowPip(!showPip)}
            className={`px-2 py-0.5 rounded transition cursor-pointer ${
              showPip ? 'bg-cyan-950/90 text-cyan-300 font-bold border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
            }`}
            title="Toggle PiP Camera Feed"
          >
            PiP
          </button>
        </div>
      </div>

      {/* 3. BOTTOM-CENTER: Precision Flight / Robot Telemetry Cockpit Strip */}
      <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-auto sm:left-1/2 sm:-translate-x-1/2 bg-slate-950/90 border border-slate-800/90 rounded-lg px-4 py-2 text-xs font-mono text-slate-300 flex flex-wrap items-center justify-between gap-4 backdrop-blur-md shadow-2xl z-20">
        {/* Robot Pose */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[10px]">POSE:</span>
          <span className="font-bold text-cyan-300">
            X:{robot.pose.x.toFixed(2)} Y:{robot.pose.y.toFixed(2)}
          </span>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Heading & Compass */}
        <div className="flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-500 text-[10px]">YAW:</span>
          <span className="font-bold text-slate-100">{headingDeg}°</span>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Linear Velocity */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500 text-[10px]">VEL:</span>
          <span className="font-bold text-slate-100">{robot.twist.linear.toFixed(2)} m/s</span>
          <span className="text-[10px] text-slate-500">({robot.twist.angular.toFixed(2)} rad/s)</span>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Proximity / Nearest Obstacle */}
        <div className="flex items-center gap-1.5">
          <AlertTriangle
            className={`w-3.5 h-3.5 ${nearestObsDist < 0.8 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}
          />
          <span className="text-slate-500 text-[10px]">PROX:</span>
          <span
            className={`font-bold ${
              nearestObsDist < 0.6
                ? 'text-red-400 font-extrabold animate-pulse'
                : nearestObsDist < 1.2
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {nearestObsDist < 99 ? `${nearestObsDist.toFixed(2)} m` : 'CLEAR'}
          </span>
        </div>

        <div className="w-px h-4 bg-slate-800" />

        {/* Target & ETA */}
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-500 text-[10px]">DIST:</span>
          <span className="font-bold text-cyan-300">
            {navigation.metrics.distance_remaining.toFixed(2)} m
          </span>
          <span className="text-[10px] text-slate-400">({navigation.metrics.eta_seconds.toFixed(0)}s)</span>
        </div>
      </div>
    </div>
  );
};

export default SimulationViewport3D;
