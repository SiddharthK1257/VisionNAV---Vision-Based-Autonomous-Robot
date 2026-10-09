"""Camera Frame Preprocessor for Neural and Computer Vision Perception Pipelines."""
import cv2
import numpy as np
from typing import Tuple, Dict, Any, Optional
from ..models.perception import BoundingBox


class PreprocessedFrame:
    def __init__(
        self,
        tensor: np.ndarray,
        orig_shape: Tuple[int, int],
        target_shape: Tuple[int, int],
        scale: float,
        pad_x: float,
        pad_y: float
    ):
        self.tensor = tensor  # Shape: (1, 3, H, W), float32 normalized [0.0, 1.0]
        self.orig_shape = orig_shape  # (H, W)
        self.target_shape = target_shape  # (target_H, target_W)
        self.scale = scale
        self.pad_x = pad_x
        self.pad_y = pad_y


class FramePreprocessor:
    """Preprocesses camera RGB frames: letterboxing, normalization, tensor transformation."""
    def __init__(self, target_size: Tuple[int, int] = (640, 640)):
        self.target_size = target_size

    def preprocess(self, frame: np.ndarray, target_size: Optional[Tuple[int, int]] = None) -> PreprocessedFrame:
        """Preprocesses raw uint8 RGB frame into letterboxed, normalized NCHW tensor."""
        if target_size is None:
            target_size = self.target_size

        orig_h, orig_w = frame.shape[:2]
        target_w, target_h = target_size

        # Compute letterbox scaling and padding
        scale = min(target_w / orig_w, target_h / orig_h)
        new_w = int(orig_w * scale)
        new_h = int(orig_h * scale)

        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Create padded canvas (gray 114 standard for YOLO/neural detectors)
        canvas = np.full((target_h, target_w, 3), 114, dtype=np.uint8)
        pad_x = (target_w - new_w) / 2.0
        pad_y = (target_h - new_h) / 2.0
        x_offset = int(pad_x)
        y_offset = int(pad_y)

        canvas[y_offset:y_offset + new_h, x_offset:x_offset + new_w] = resized

        # Normalize to [0.0, 1.0] float32
        tensor = canvas.astype(np.float32) / 255.0

        # Transpose HWC -> CHW -> NCHW
        tensor = np.transpose(tensor, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0)

        return PreprocessedFrame(
            tensor=tensor,
            orig_shape=(orig_h, orig_w),
            target_shape=(target_h, target_w),
            scale=scale,
            pad_x=pad_x,
            pad_y=pad_y
        )

    def unpad_bbox(self, bbox: BoundingBox, meta: PreprocessedFrame) -> BoundingBox:
        """Maps bounding box from letterboxed target canvas coordinates to original image coordinates."""
        target_w, target_h = meta.target_shape
        orig_h, orig_w = meta.orig_shape

        # Pixel coords in letterboxed image
        bx = bbox.x * target_w
        by = bbox.y * target_h
        bw = bbox.width * target_w
        bh = bbox.height * target_h

        # Subtract padding
        unpad_x = (bx - meta.pad_x) / meta.scale
        unpad_y = (by - meta.pad_y) / meta.scale
        unpad_w = bw / meta.scale
        unpad_h = bh / meta.scale

        # Normalize to original image dimensions [0, 1]
        norm_x = max(0.0, min(1.0, unpad_x / orig_w))
        norm_y = max(0.0, min(1.0, unpad_y / orig_h))
        norm_w = max(0.01, min(1.0 - norm_x, unpad_w / orig_w))
        norm_h = max(0.01, min(1.0 - norm_y, unpad_h / orig_h))

        return BoundingBox(
            x=round(norm_x, 4),
            y=round(norm_y, 4),
            width=round(norm_w, 4),
            height=round(norm_h, 4)
        )
