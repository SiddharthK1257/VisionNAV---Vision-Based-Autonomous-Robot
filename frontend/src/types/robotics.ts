export type EnvironmentType = 'warehouse' | 'office' | 'smart_laboratory';

export type NavigationState =
  | 'IDLE'
  | 'MISSION_RECEIVED'
  | 'TARGET_SEARCHING'
  | 'TARGET_IDENTIFIED'
  | 'TARGET_LOCALIZED'
  | 'GOAL_SET'
  | 'PLANNING_GLOBAL_PATH'
  | 'GLOBAL_PATH_COMPUTED'
  | 'LOCAL_PATH_GENERATED'
  | 'NAVIGATING'
  | 'OBSTACLE_DETECTED'
  | 'ROBOT_STOPPING'
  | 'ROBOT_STOPPED'
  | 'LOCAL_MAP_UPDATED'
  | 'REPLANNING'
  | 'NEW_ROUTE_CALCULATED'
  | 'TARGET_REACHED'
  | 'PAUSED'
  | 'ERROR'
  | 'SEARCHING'
  | 'TARGET_FOUND'
  | 'PLANNING';

export type NavTab =
  | 'command_center'
  | 'live_vision'
  | 'navigation_map'
  | 'decision_log'
  | 'mission_results'
  | 'overview'
  | 'navigation'
  | 'analytics'
  | 'mission_control'
  | 'world_model'
  | 'sensors'
  | 'settings';

export type ActionType =
  | 'SEARCH'
  | 'MOVE_FORWARD'
  | 'TURN'
  | 'STOP'
  | 'SLOW_DOWN'
  | 'AVOID'
  | 'REPLAN'
  | 'FOLLOW_PATH'
  | 'TARGET_REACHED'
  | 'WAIT';

export interface CompletedMissionRecord {
  id: string;
  prompt: string;
  target_name: string;
  environment: string;
  start_time: number;
  end_time?: number | null;
  status: string;
  path_length: number;
  optimal_path_length: number;
  replans_count: number;
  obstacle_encounters: number;
  average_speed: number;
  collisions: number;
  path_efficiency: number;
  final_robot_position?: { x: number; y: number; theta: number } | null;
  target_acquisition?: {
    name: string;
    confidence: number;
    distance: number;
    world_x: number;
    world_y: number;
    source: string;
  } | null;
  decision_timeline?: any[];
}

export interface Pose2D {
  x: number;
  y: number;
  theta: number;
}

export interface Twist2D {
  linear: number;
  angular: number;
}

export interface WheelVelocities {
  left: number;
  right: number;
}

export interface BatteryState {
  percentage: number;
  voltage: number;
  is_charging: boolean;
  discharge_rate: number;
}

export interface RobotState {
  pose: Pose2D;
  twist: Twist2D;
  target_twist: Twist2D;
  wheels: WheelVelocities;
  battery: BatteryState;
  emergency_stop: boolean;
  status: string;
  current_behavior: string;
  odometry_distance: number;
  sensor_health: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Detection {
  track_id: string;
  class_name: string;
  class?: string;
  confidence: number;
  distance: number;
  bbox: BoundingBox;
  position?: [number, number, number];
  position_3d: [number, number, number];
  timestamp?: number;
  is_target: boolean;
  attribute?: string | null;
  model_source?: string;
  is_fallback?: boolean;
}

export interface PerceptionPipelineStatus {
  detector_name: string;
  detector_type: string;
  is_fallback: boolean;
  model_path?: string | null;
  supported_classes: string[];
  camera_fps: number;
  active_tracks: number;
  total_detections: number;
  documentation: string;
}

export interface TrackedObject {
  track_id: string;
  class_name: string;
  confidence: number;
  distance: number;
  position: [number, number];
  velocity: [number, number];
  is_dynamic: boolean;
  first_seen: number;
  last_seen: number;
  status: string;
}

export interface LiDARHit {
  angle: number;
  distance: number;
  x: number;
  y: number;
  hit: boolean;
}

export interface Waypoint {
  x: number;
  y: number;
  theta: number;
}

export interface PathPlan {
  waypoints: Waypoint[];
  total_length: number;
  generated_at: number;
  is_valid: boolean;
}

export interface NavigationMetrics {
  path_length: number;
  distance_remaining: number;
  replans_count: number;
  average_speed: number;
  navigation_time: number;
  obstacle_encounters: number;
  eta_seconds: number;
  path_efficiency: number;
}

export type NavigationPipelineStage =
  | 'Mission'
  | 'Target identification'
  | 'Target localization'
  | 'Navigation goal'
  | 'Global path'
  | 'Local path'
  | 'Obstacle checking'
  | 'Velocity controller'
  | 'Robot movement';

export interface StateTransitionRecord {
  timestamp: number;
  time_str: string;
  from_state: string;
  to_state: string;
  stage: string;
  reason: string;
  details?: Record<string, any>;
}

export interface TargetLocalizationData {
  target_class: string;
  target_attribute?: string | null;
  target_name: string;
  confidence: number;
  distance: number;
  bearing_rad: number;
  world_x: number;
  world_y: number;
  confirmed: boolean;
}

export interface ObstacleDetectionData {
  detected: boolean;
  obstacle_id?: string | null;
  name?: string | null;
  x: number;
  y: number;
  distance: number;
  cleared: boolean;
  detection_type: string;
}

export interface NavigationStatus {
  state: NavigationState;
  pipeline_stage?: string;
  current_goal: [number, number] | null;
  goal_name: string | null;
  path: PathPlan;
  global_path?: PathPlan;
  local_path?: PathPlan;
  current_waypoint_index: number;
  metrics: NavigationMetrics;
  last_replan_reason?: string | null;
  state_history?: StateTransitionRecord[];
  target_localization?: TargetLocalizationData | null;
  active_obstacle?: ObstacleDetectionData | null;
}

export interface DecisionEntry {
  id: string;
  timestamp: string;
  epoch: number;
  action: ActionType;
  reason: string;
  confidence: number;
  context: Record<string, any>;
}

export interface VLMStructuredOutput {
  scene_summary: string;
  target_visible: boolean;
  target_class: string | null;
  target_confidence: number;
  navigation_constraint: string | null;
  recommended_action: string;
  spatial_reasoning: string;
  safety_advisory: string;
}

export interface AnalyticsSummary {
  total_missions: number;
  successful_missions: number;
  navigation_success_rate: number;
  average_path_efficiency: number;
  perception_stability: number;
  total_replans: number;
  total_obstacle_encounters: number;
  average_speed: number;
  average_mission_duration: number;
}

export interface StaticObstacle {
  id: string;
  name: string;
  class_name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  is_furniture: boolean;
  attribute?: string | null;
}

export interface DynamicObstacle {
  id: string;
  name: string;
  class_name: string;
  x: number;
  y: number;
  radius: number;
  speed: number;
  waypoints: [number, number][];
  current_target_index: number;
  attribute?: string | null;
  color: string;
}

export interface TargetLocation {
  id: string;
  name: string;
  class_name: string;
  attribute?: string | null;
  x: number;
  y: number;
  radius: number;
  color: string;
}

export interface WorldState {
  environment_type: EnvironmentType;
  width: number;
  height: number;
  robot: RobotState;
  tracked_objects: TrackedObject[];
  static_obstacles: StaticObstacle[];
  dynamic_obstacles: DynamicObstacle[];
  targets: TargetLocation[];
  active_target: TargetLocation | null;
  navigation: NavigationStatus;
  lidar_hits: LiDARHit[];
  nearest_obstacle_distance: number;
  timestamp: number;
}

export interface TelemetryPacket {
  type: string;
  timestamp: number;
  simulation_mode: boolean;
  environment: EnvironmentType;
  robot: RobotState;
  navigation: NavigationStatus;
  detections: Detection[];
  tracked: TrackedObject[];
  decisions: DecisionEntry[];
  vlm_reasoning: VLMStructuredOutput | null;
  lidar_rays: LiDARHit[];
  nearest_obstacle: number;
  active_target: string | null;
  metrics: NavigationMetrics;
  analytics: AnalyticsSummary;
  camera_frame?: string | null;
  depth_preview?: string | null;
  pipeline_status?: PerceptionPipelineStatus | null;
  imu?: {
    orientation: { roll: number; pitch: number; yaw: number };
    angular_velocity: { x: number; y: number; z: number };
    linear_acceleration: { x: number; y: number; z: number };
  };
  odometry?: {
    pose: Pose2D;
    twist: Twist2D;
    total_distance: number;
    left_ticks: number;
    right_ticks: number;
  };
  scene_understanding?: SceneUnderstandingData | null;
}

export interface SceneUnderstandingData {
  visible_objects: string[];
  target_candidates: string[];
  navigable_space: string;
  blocked_space?: string | null;
  nearby_people: string[];
  static_obstacles: string[];
  dynamic_obstacles: string[];
  potential_path_conflicts: string[];
  concise_explanation: string;
}
