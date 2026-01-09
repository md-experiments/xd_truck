import type RAPIER from '@dimforge/rapier3d-compat';

export type AccelerationCurvePoint = {
  speed: number;
  acceleration: number;
};

export type TruckTuning = {
  maxSpeed: number;
  maxReverseSpeed: number;
  wheelBase: number;
  brakeDeceleration: number;
  lateralGrip: number;
  rollingResistance: number;
  accelerationCurve: AccelerationCurvePoint[];
};

export type TruckInput = {
  steeringAngle: number;
  throttle: number;
  brake: number;
  reverse: boolean;
};

export class KinematicTruckController {
  private rigidBody: RAPIER.RigidBody;
  private tuning: TruckTuning;

  constructor(rigidBody: RAPIER.RigidBody, tuning: TruckTuning) {
    this.rigidBody = rigidBody;
    this.tuning = tuning;
  }

  setTuning(tuning: Partial<TruckTuning>) {
    this.tuning = { ...this.tuning, ...tuning };
  }

  update(dt: number, input: TruckInput) {
    const forward = this.rigidBody.rotation().transformVector({ x: 0, y: 0, z: 1 });
    const right = this.rigidBody.rotation().transformVector({ x: 1, y: 0, z: 0 });

    const linvel = this.rigidBody.linvel();
    const forwardSpeed = dot(linvel, forward);
    const lateralSpeed = dot(linvel, right);

    const targetAcceleration = this.computeLongitudinalAcceleration(
      forwardSpeed,
      input.throttle,
      input.brake,
      input.reverse
    );

    const newForwardSpeed = clamp(
      forwardSpeed + targetAcceleration * dt,
      -this.tuning.maxReverseSpeed,
      this.tuning.maxSpeed
    );

    const lateralDamping = this.tuning.lateralGrip * dt;
    const newLateralSpeed = approach(lateralSpeed, 0, lateralDamping);

    const newVelocity = {
      x: forward.x * newForwardSpeed + right.x * newLateralSpeed,
      y: linvel.y,
      z: forward.z * newForwardSpeed + right.z * newLateralSpeed,
    };

    this.rigidBody.setLinvel(newVelocity, true);

    const yawRate = this.computeYawRate(newForwardSpeed, input.steeringAngle);
    this.rigidBody.setAngvel({ x: 0, y: yawRate, z: 0 }, true);
  }

  private computeYawRate(speed: number, steeringAngle: number) {
    const grip = clamp(this.tuning.lateralGrip, 0, 1);
    if (Math.abs(speed) < 0.01) {
      return 0;
    }

    return (speed / this.tuning.wheelBase) * Math.tan(steeringAngle) * grip;
  }

  private computeLongitudinalAcceleration(
    speed: number,
    throttle: number,
    brake: number,
    reverse: boolean
  ) {
    const throttleAccel = sampleAccelerationCurve(
      Math.abs(speed),
      this.tuning.accelerationCurve
    );
    const signedThrottle = reverse ? -throttle : throttle;
    const engineAccel = throttleAccel * signedThrottle;
    const brakeAccel = this.tuning.brakeDeceleration * clamp(brake, 0, 1) * -Math.sign(speed || 1);
    const resistance = this.tuning.rollingResistance * -Math.sign(speed || 1);

    return engineAccel + brakeAccel + resistance;
  }
}

function sampleAccelerationCurve(speed: number, curve: AccelerationCurvePoint[]) {
  if (curve.length === 0) {
    return 0;
  }

  if (speed <= curve[0].speed) {
    return curve[0].acceleration;
  }

  for (let i = 0; i < curve.length - 1; i += 1) {
    const start = curve[i];
    const end = curve[i + 1];
    if (speed >= start.speed && speed <= end.speed) {
      const t = (speed - start.speed) / (end.speed - start.speed || 1);
      return start.acceleration + (end.acceleration - start.acceleration) * t;
    }
  }

  return curve[curve.length - 1].acceleration;
}

function dot(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function approach(value: number, target: number, delta: number) {
  if (value < target) {
    return Math.min(value + delta, target);
  }
  return Math.max(value - delta, target);
}
