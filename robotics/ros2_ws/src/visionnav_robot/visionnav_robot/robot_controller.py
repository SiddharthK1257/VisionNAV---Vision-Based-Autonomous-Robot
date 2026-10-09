"""ROS 2 Node: Differential-Drive Controller & Odometry Publisher."""
import rclpy
from rclpy.node import Node
import math
from geometry_msgs.msg import Twist, TransformStamped
from nav_msgs.msg import Odometry
import tf2_ros


class VisionNavRobotController(Node):
    def __init__(self):
        super().__init__('visionnav_controller')
        self.wheel_base = 0.45
        self.wheel_radius = 0.10

        self.x = 2.0
        self.y = 2.0
        self.theta = 0.0

        self.sub_cmd = self.create_subscription(Twist, '/cmd_vel', self.cmd_vel_callback, 10)
        self.pub_odom = self.create_publisher(Odometry, '/odom', 10)
        self.tf_broadcaster = tf2_ros.TransformBroadcaster(self)

        self.current_twist = Twist()
        self.timer = self.create_timer(0.05, self.update_physics)
        self.last_time = self.get_clock().now()
        self.get_logger().info("VisionNav Robot Controller Node online.")

    def cmd_vel_callback(self, msg: Twist):
        self.current_twist = msg

    def update_physics(self):
        now = self.get_clock().now()
        dt = (now - self.last_time).nanoseconds * 1e-9
        self.last_time = now

        v = self.current_twist.linear.x
        omega = self.current_twist.angular.z

        # Differential drive odometry
        self.x += v * math.cos(self.theta) * dt
        self.y += v * math.sin(self.theta) * dt
        self.theta += omega * dt

        # Publish Odometry msg
        odom = Odometry()
        odom.header.stamp = now.to_msg()
        odom.header.frame_id = 'odom'
        odom.child_frame_id = 'base_footprint'
        odom.pose.pose.position.x = self.x
        odom.pose.pose.position.y = self.y
        odom.pose.pose.orientation.z = math.sin(self.theta / 2.0)
        odom.pose.pose.orientation.w = math.cos(self.theta / 2.0)
        odom.twist.twist.linear.x = v
        odom.twist.twist.angular.z = omega
        self.pub_odom.publish(odom)

        # Broadcast TF
        t = TransformStamped()
        t.header.stamp = now.to_msg()
        t.header.frame_id = 'odom'
        t.child_frame_id = 'base_footprint'
        t.transform.translation.x = self.x
        t.transform.translation.y = self.y
        t.transform.rotation.z = math.sin(self.theta / 2.0)
        t.transform.rotation.w = math.cos(self.theta / 2.0)
        self.tf_broadcaster.sendTransform(t)


def main(args=None):
    rclpy.init(args=args)
    node = VisionNavRobotController()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    node.destroy_node()
    rclpy.shutdown()
