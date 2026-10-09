from setuptools import setup
import os
from glob import glob

package_name = 'visionnav_robot'

setup(
    name=package_name,
    version='1.0.0',
    packages=[package_name],
    data_files=[
        ('share/ament_index/resource_index/packages', ['resource/' + package_name]),
        ('share/' + package_name, ['package.xml']),
        (os.path.join('share', package_name, 'launch'), glob('launch/*.launch.py')),
        (os.path.join('share', package_name, 'urdf'), glob('urdf/*.*')),
        (os.path.join('share', package_name, 'config'), glob('config/*.*')),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    maintainer='VisionNav AI Team',
    maintainer_email='dev@visionnav.ai',
    description='VisionNav AI: Vision-Based Autonomous Mobile Robot with ROS 2 and Nav2',
    license='MIT',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            'robot_controller = visionnav_robot.robot_controller:main',
            'perception_node = visionnav_robot.perception_node:main',
            'safety_monitor = visionnav_robot.safety_monitor:main',
            'vlm_reasoning_node = visionnav_robot.vlm_reasoning_node:main',
        ],
    },
)
