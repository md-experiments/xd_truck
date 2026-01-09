import type RAPIER from '@dimforge/rapier3d-compat';

export type CollisionImpactEffects = {
  magnitude: number;
  audio: {
    volume: number;
    pitch: number;
  };
  cameraShake: number;
  particleCount: number;
};

export type CollisionEffectTuning = {
  maxMagnitude: number;
  minAudioPitch: number;
  maxAudioPitch: number;
  maxParticles: number;
  maxShake: number;
};

export function configureCollisionEvents(collider: RAPIER.Collider) {
  collider.setActiveEvents(
    RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS
  );
}

export function drainCollisionEvents(
  rapier: typeof RAPIER,
  eventQueue: RAPIER.EventQueue,
  tuning: CollisionEffectTuning,
  handler: (collider1: RAPIER.ColliderHandle, collider2: RAPIER.ColliderHandle, effects: CollisionImpactEffects) => void
) {
  eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    if (!started) {
      return;
    }

    const magnitude = 0;
    const effects = mapImpactToEffects(magnitude, tuning);
    handler(handle1, handle2, effects);
  });

  eventQueue.drainContactForceEvents((event) => {
    const magnitude = event.totalForceMagnitude();
    const effects = mapImpactToEffects(magnitude, tuning);
    handler(event.collider1(), event.collider2(), effects);
  });
}

function mapImpactToEffects(magnitude: number, tuning: CollisionEffectTuning): CollisionImpactEffects {
  const clamped = clamp(magnitude / tuning.maxMagnitude, 0, 1);

  return {
    magnitude,
    audio: {
      volume: clamped,
      pitch: lerp(tuning.minAudioPitch, tuning.maxAudioPitch, clamped),
    },
    cameraShake: tuning.maxShake * clamped,
    particleCount: Math.round(tuning.maxParticles * clamped),
  };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
