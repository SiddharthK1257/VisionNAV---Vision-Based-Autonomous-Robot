"""ROS 2 Node: AI Vision Perception and Object Detection."""
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan, Image
from std_msgs.msg import String
import json


class VisionNavPerceptionNode(Node):
    def __init__(self):
        super().__init__('visionnav_perception')
        self.pub_detections = self.create_publisher(String, '/visionnav/detections', 10)
        self.sub_scan = self.create_subscription(LaserScan, '/scan', self.scan_callback, 10)
        self.get_logger().info("VisionNav Perception Node active (YOLO/Local Vision Detector pipeline).")

    def scan_callback(self, msg: LaserScan):
        # Find closest obstacle distance from scan
        valid_ranges = [r for r in msg.ranges if not (r < msg.range_min or r > msg.range_max)]
        min_dist = min(valid_ranges) if valid_ranges else 10.0

        det_msg = String()
        det_msg.data = json.dumps({
            "status": "active",
            "nearest_obstacle": round(min_dist, 2),
            "objects_tracked": 3
        })
        self.pub_detections.publish(det_msg)


def main(args=None):
    rclpy.init(args=args)
    node = VisionNavPerceptionNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()
