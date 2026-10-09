# VisionNav AI — Simulation Assets & 3D Meshes

This directory contains metadata and references for 3D simulation assets and sensor materials used by the VisionNav Autonomous Robot.

## Assets Catalog

### 1. Robot Chassis & Wheels
- **Description:** Differential-drive mobile base ($0.60\text{ m} \times 0.45\text{ m} \times 0.28\text{ m}$)
- **Materials:** High-contrast industrial yellow & dark slate chassis with dual rubber drive wheels ($R = 0.10\text{ m}$, track width $L = 0.45\text{ m}$).
- **Sensors Mounted:**
  - Front RGB Pinhole Camera ($80^\circ$ horizontal FOV, $60^\circ$ vertical FOV, elevation $0.35\text{ m}$).
  - Solid-state Depth Camera ($80$ range bins, $0.2\text{ m} - 8.0\text{ m}$).
  - 360° Planar LiDAR ($72$ laser beams, $360^\circ$ sweep, $0.15\text{ m} - 12.0\text{ m}$).
  - 6-DOF IMU & dual quadrature wheel encoders.

### 2. Indoor Environment Assets
- **Industrial Warehouse:** High-bay storage racks, QA tables, forklift barriers, blue shipping packages, emergency supply kits, worker avatar (*Technician Alex*).
- **Corporate Tech Office:** Cubicle partitions, conference table, lounge armchairs, coffee mugs, laptops, backpacks, roving colleague (*Colleague Jordan*).
- **Smart Laboratory:** Biosafety cabinets, analytical workbenches, centrifuge tables, sample containers, chemical storage, researcher avatar (*Dr. Elena*).

### 3. Rendering Profiles
- **Three.js WebGL Engine:** Dynamic soft shadow mapping, ambient floor grid, laser ray tracing, waypoint route markers, dynamic obstacle velocity vectors.
- **2D Synthetic Camera Engine:** Perspective projection, floor vanishing horizon, real-time bounding box annotations with tracking IDs and distance tags.
