import { createFaceEngine, type FaceEngine } from '@perigee/face';

let engine: FaceEngine | null = null;

export function getFaceEngine(): FaceEngine {
  if (!engine) engine = createFaceEngine();
  return engine;
}
