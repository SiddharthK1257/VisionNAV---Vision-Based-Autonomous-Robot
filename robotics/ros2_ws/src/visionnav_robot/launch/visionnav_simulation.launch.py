"""ROS 2 Launch file for VisionNav Autonomous Robot."""
import os
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.launch_description_sources import PythonLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    pkg_dir = get_package_share_directory('visionnav_robot')
    urdf_file = os.path.join(pkg_dir, 'urdf', 'visionnav_robot.urdf.xacro')

    with open(urdf_file, 'r') as infp:
        robot_desc = infp.read()

    return LaunchDescription([
        DeclareLaunchArgument(
            'use_sim_time',
            default_value='true',
            description='Use simulation (Gazebo/Isaac) clock if true'
        ),

        # Robot State Publisher
        Node(
            package='robot_state_publisher',
            executable='robot_state_publisher',
            name='robot_state_publisher',
            output='screen',
            parameters=[{'robot_description': robot_desc, 'use_sim_time': LaunchConfiguration('use_sim_time')}]
        ),

        # VisionNav Robot Motion Controller
        Node(
            package='visionnav_robot',
            executable='robot_controller',
            name='visionnav_controller',
            output='screen',
            parameters=[{'use_sim_time': LaunchConfiguration('use_sim_time')}]
        ),

        # Perception & AI Detection Node
        Node(
            package='visionnav_robot',
            executable='perception_node',
            name='visionnav_perception',
            output='screen'
        ),

        # Safety Monitor Node
        Node(
            package='visionnav_robot',
            executable='safety_monitor',
            name='visionnav_safety_monitor',
            output='screen'
        ),
    ])
