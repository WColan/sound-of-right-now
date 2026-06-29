const DEFAULT_X_RANGE = 1.25;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function clampPan(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function panToX(value, range = DEFAULT_X_RANGE) {
  const safeRange = Number.isFinite(range) && range > 0 ? range : DEFAULT_X_RANGE;
  return clampPan(value) * safeRange;
}

export function widthToZ(width, nearZ = -0.35, farZ = -1.1) {
  const t = clamp01(width);
  return farZ + (nearZ - farZ) * t;
}

export function createSpatialNode(ToneLib, options = {}) {
  const range = Number.isFinite(options.range) && options.range > 0 ? options.range : DEFAULT_X_RANGE;
  const initialPan = clampPan(options.pan ?? 0);
  const initialX = Number.isFinite(options.x) ? options.x : panToX(initialPan, range);
  const initialY = Number.isFinite(options.y) ? options.y : 0;
  const initialZ = Number.isFinite(options.z) ? options.z : -0.8;

  if (typeof ToneLib?.Panner3D === 'function') {
    try {
      const node = new ToneLib.Panner3D({
        panningModel: 'HRTF',
        distanceModel: options.distanceModel ?? 'inverse',
        refDistance: options.refDistance ?? 1,
        rolloffFactor: options.rolloffFactor ?? 0.35,
        maxDistance: options.maxDistance ?? 8,
        positionX: initialX,
        positionY: initialY,
        positionZ: initialZ,
        orientationX: 0,
        orientationY: 0,
        orientationZ: 1,
      });

      const setParam = (param, value, duration = 0) => {
        if (!param) return;
        if (duration > 0 && typeof param.linearRampTo === 'function') {
          param.linearRampTo(value, duration);
        } else {
          param.value = value;
        }
      };

      return {
        node,
        mode: 'hrtf',
        is3D: true,
        setX(value, duration = 0) {
          setParam(node.positionX, value, duration);
        },
        setY(value, duration = 0) {
          setParam(node.positionY, value, duration);
        },
        setZ(value, duration = 0) {
          setParam(node.positionZ, value, duration);
        },
        setPan(value, duration = 0) {
          const x = panToX(value, range);
          setParam(node.positionX, x, duration);
        },
      };
    } catch (err) {
      console.warn('Panner3D unavailable, falling back to stereo panner:', err);
    }
  }

  const node = new ToneLib.Panner(initialPan);
  return {
    node,
    mode: 'stereo-fallback',
    is3D: false,
    setX(value, duration = 0) {
      const pan = clampPan(value / range);
      if (duration > 0 && typeof node.pan?.linearRampTo === 'function') {
        node.pan.linearRampTo(pan, duration);
      } else if (node.pan) {
        node.pan.value = pan;
      }
    },
    setY() {},
    setZ() {},
    setPan(value, duration = 0) {
      const pan = clampPan(value);
      if (duration > 0 && typeof node.pan?.linearRampTo === 'function') {
        node.pan.linearRampTo(pan, duration);
      } else if (node.pan) {
        node.pan.value = pan;
      }
    },
  };
}
