export interface Light {
  x: number;
  y: number;
}

interface Dot {
  x: number;
  y: number;
}

export interface Dots {
  p1: Dot;
  p2: Dot;
  p3: Dot;
  p4: Dot;
}

export interface Point {
  endX: number;
  endY: number;
  startX: number;
  startY: number;
}

export interface CanvasBox {
  halfSize: number;
  x: number;
  y: number;
  radius: number;
  shadowLight: number;
  color: string;
  getDots: () => Dots;
  rotate: () => void;
  draw: () => void;
  drawShadow: () => void;
}

export interface CanvasMouseEvent extends MouseEvent {
  layerX: number;
  layerY: number;
}
