import React from 'react';
import { Composition } from 'remotion';
import { Trailer } from './Trailer';
import { TrailerVertical } from './TrailerVertical';
import { MASTER_FPS, TRAILER_FRAMES, VERTICAL_FPS, VTRAILER_FRAMES } from './beats';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} width={1920} height={1080} fps={MASTER_FPS} durationInFrames={TRAILER_FRAMES} />
    <Composition id="TrailerVertical" component={TrailerVertical} width={1080} height={1920} fps={VERTICAL_FPS} durationInFrames={VTRAILER_FRAMES} />
  </>
);
