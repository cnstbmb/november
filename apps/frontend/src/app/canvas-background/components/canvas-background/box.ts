import {
  CanvasBox,
  Dots,
  Light,
  Point
} from '@app/canvas-background/components/canvas-background/types';
import random from 'lodash-es/random';
import forIn from 'lodash-es/forIn';
import {
  darkGrey,
  green,
  red,
  yellow
} from '@app/canvas-background/components/canvas-background/colors';

export class Box implements CanvasBox {
  x = random(0, this.canvasWidth);

  y = random(0, this.canvasHeight);

  radius = random(0, Math.PI, true);

  readonly halfSize = random(0, 50);

  readonly shadowLight = 2000;

  readonly color: string;

  private readonly darkGrey = darkGrey;

  private readonly colors: string[] = [yellow, red, green];

  private get yOutsideCanvas(): boolean {
    return this.y - this.halfSize > this.canvasHeight;
  }

  private get xOutsideCanvas(): boolean {
    return this.x - this.halfSize > this.canvasWidth;
  }

  constructor(
    private readonly canvasWidth: number,
    private readonly canvasHeight: number,
    private readonly context: CanvasRenderingContext2D,
    private readonly light: Light
  ) {
    if (!context) {
      throw new Error('Context is undefined.');
    }

    this.color = this.getRandomColor();
  }

  getDots(): Dots {
    const full = (Math.PI * 2) / 4;
    const p1 = {
      x: this.x + this.halfSize * Math.sin(this.radius),
      y: this.y + this.halfSize * Math.cos(this.radius)
    };
    const p2 = {
      x: this.x + this.halfSize * Math.sin(this.radius + full),
      y: this.y + this.halfSize * Math.cos(this.radius + full)
    };
    const p3 = {
      x: this.x + this.halfSize * Math.sin(this.radius + full * 2),
      y: this.y + this.halfSize * Math.cos(this.radius + full * 2)
    };
    const p4 = {
      x: this.x + this.halfSize * Math.sin(this.radius + full * 3),
      y: this.y + this.halfSize * Math.cos(this.radius + full * 3)
    };

    return {
      p1,
      p2,
      p3,
      p4
    };
  }

  rotate(): void {
    const speed = (60 - this.halfSize) / 20;
    this.radius += speed * 0.002;
    this.x += speed;
    this.y += speed;
  }

  draw(): void {
    const dots = this.getDots();
    this.context.beginPath();
    this.context.moveTo(dots.p1.x, dots.p1.y);
    this.context.lineTo(dots.p2.x, dots.p2.y);
    this.context.lineTo(dots.p3.x, dots.p3.y);
    this.context.lineTo(dots.p4.x, dots.p4.y);
    this.context.fillStyle = this.color;
    this.context.fill();

    if (this.yOutsideCanvas) {
      this.y -= this.canvasHeight + 100;
    }
    if (this.xOutsideCanvas) {
      this.x -= this.canvasWidth + 100;
    }
  }

  drawShadow(): void {
    const dots = this.getDots();
    const angles = [];
    const points: Point[] = [];

    forIn(dots, ({ y: dotY, x: dotX }) => {
      const angle = Math.atan2(this.light.y - dotY, this.light.x - dotX);
      const endX = dotX + this.shadowLight * Math.sin(-angle - Math.PI / 2);
      const endY = dotY + this.shadowLight * Math.cos(-angle - Math.PI / 2);
      angles.push(angle);
      points.push({
        endX,
        endY,
        startX: dotX,
        startY: dotY
      });
    });

    points.forEach((point, index) => {
      const nextIndex = index === 3 ? 0 : index + 1;
      this.context.beginPath();
      this.context.moveTo(point.startX, point.startY);
      this.context.lineTo(points[nextIndex].startX, points[nextIndex].startY);
      this.context.lineTo(points[nextIndex].endX, points[nextIndex].endY);
      this.context.lineTo(point.endX, point.endY);
      this.context.fillStyle = this.darkGrey;
      this.context.fill();
    });
  }

  private getRandomColor(): string {
    const randomIndex = random(0, this.colors.length - 1);

    return this.colors[randomIndex];
  }
}
