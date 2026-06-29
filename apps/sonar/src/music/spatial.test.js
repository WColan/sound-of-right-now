import { describe, expect, it } from 'vitest';
import { clampPan, createSpatialNode, panToX, widthToZ } from './spatial.js';

class TestParam {
  constructor(value = 0) {
    this.value = value;
    this.ramps = [];
  }

  linearRampTo(value, duration) {
    this.value = value;
    this.ramps.push([value, duration]);
  }
}

describe('spatial helpers', () => {
  it('clamps pan and maps pan to x', () => {
    expect(clampPan(2)).toBe(1);
    expect(clampPan(-2)).toBe(-1);
    expect(clampPan(Number.NaN)).toBe(0);
    expect(panToX(0.5, 2)).toBe(1);
    expect(panToX(2, 2)).toBe(2);
  });

  it('maps width to z depth', () => {
    expect(widthToZ(0, -0.4, -1.2)).toBeCloseTo(-1.2, 6);
    expect(widthToZ(1, -0.4, -1.2)).toBeCloseTo(-0.4, 6);
    expect(widthToZ(0.5, -0.4, -1.2)).toBeCloseTo(-0.8, 6);
  });

  it('uses Panner3D when available', () => {
    class Panner3D {
      constructor(options = {}) {
        this.options = options;
        this.positionX = new TestParam(options.positionX ?? 0);
        this.positionY = new TestParam(options.positionY ?? 0);
        this.positionZ = new TestParam(options.positionZ ?? 0);
      }
    }
    class Panner {
      constructor(pan = 0) {
        this.pan = new TestParam(pan);
      }
    }

    const spatial = createSpatialNode({ Panner3D, Panner }, { pan: 0.4, range: 2, z: -1 });
    expect(spatial.mode).toBe('hrtf');
    expect(spatial.is3D).toBe(true);
    expect(spatial.node.positionX.value).toBeCloseTo(0.8, 6);
    spatial.setPan(-0.5, 3);
    expect(spatial.node.positionX.ramps.at(-1)).toEqual([-1, 3]);
  });

  it('falls back to stereo panner when 3D is unavailable', () => {
    class Panner {
      constructor(pan = 0) {
        this.pan = new TestParam(pan);
      }
    }

    const spatial = createSpatialNode({ Panner }, { pan: 0.2, range: 2 });
    expect(spatial.mode).toBe('stereo-fallback');
    expect(spatial.is3D).toBe(false);
    spatial.setX(1, 2);
    expect(spatial.node.pan.ramps.at(-1)).toEqual([0.5, 2]);
  });
});
