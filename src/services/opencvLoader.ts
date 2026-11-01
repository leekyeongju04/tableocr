/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import cvModule from '@techstark/opencv-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedCv: any = null;
let initPromise: Promise<any> | null = null;

export function isCvReady(): boolean {
  return !!(cachedCv && cachedCv.Mat);
}

export async function loadOpenCV(): Promise<any> {
  if (cachedCv && cachedCv.Mat) {
    return cachedCv;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    // 1. Check window.cv
    if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
      cachedCv = (window as any).cv;
      return cachedCv;
    }

    // 2. Initialize from npm package @techstark/opencv-js
    let cv: any = cvModule;
    if (typeof cv === 'function') {
      cv = await cv();
    } else if (cv instanceof Promise || (cv && typeof cv.then === 'function')) {
      cv = await cv;
    }

    if (cv && cv.Mat) {
      cachedCv = cv;
      if (typeof window !== 'undefined') {
        (window as any).cv = cv;
      }
      return cachedCv;
    }

    // 3. Fallback: Wait for onRuntimeInitialized
    if (cv && typeof cv === 'object' && !cv.Mat) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('OpenCV runtime initialization timed out after 20s.'));
        }, 20000);

        const prev = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          clearTimeout(timeout);
          if (prev) prev();
          resolve();
        };

        // Polling check in case event already fired
        const interval = setInterval(() => {
          if (cv.Mat || (typeof window !== 'undefined' && (window as any).cv?.Mat)) {
            clearTimeout(timeout);
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    }

    cachedCv = (typeof window !== 'undefined' && (window as any).cv?.Mat) ? (window as any).cv : cv;
    return cachedCv;
  })();

  return initPromise;
}
