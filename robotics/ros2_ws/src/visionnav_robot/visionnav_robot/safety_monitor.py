"""ROS 2 Node: Safety Supervisor and Emergency Brake Controller."""
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import LaserScan
from geometry_msgs.msg import Twist


class VisionNavSafetyMonitorNode(Node):
    def __init__(self):
        super().__init__('visionnav_safety_monitor')
        self.critical_distance = 0.45  # meters
        self.sub_scan = self.create_subscription(LaserScan, '/scan', self.scan_callback, 10)
        self.pub_safe_cmd = self.create_publisher(Twist, '/cmd_vel_safe', 10)
        self.sub_raw_cmd = self.create_subscription(Twist, '/cmd_vel_raw', self.raw_cmd_callback, 10)
        self.current_cmd = Twist()
        self.is_critical = False
        self.get_logger().info("VisionNav Safety Supervisor Node online.")

    def scan_callback(self, msg: LaserScan):
        valid = [r for r in msg.ranges if not (r < msg.range_min or r > msg.range_max)]
        if valid and min(valid) < self.critical_distance:
            self.is_critical = True
        else:
            self.is_critical = False

    def raw_cmd_callback(self, msg: Twist):
        safe_msg = Twist()
        if self.is_critical:
            self.get_logger().warn("SAFETY INTERVENTION: Critical obstacle proximity. Halting robot forward drive.")
            safe_msg.linear.x = 0.0
            safe_msg.angular.z = msg.angular.z * 0.2
        else:
            safe_msg = msg
        self.pub_safe_cmd.publish(safe_msg)


def main(args=None):
    rclpy.init(args=args)
    node = VisionNavSafetyMonitorNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()
