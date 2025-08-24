import { describe, it, expect } from 'vitest';
import { extractVideoId } from '../my-worker/src/utils.js';

describe('utils', () => {
  it('extracts id from youtube links', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
});