import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild
} from '@angular/core';
import {
  CanvasBox,
  CanvasMouseEvent,
  Light
} from '@app/canvas-background/components/canvas-background/types';
import { Box } from '@app/canvas-background/components/canvas-background/box';
import { darkGrey, grey, white } from '@app/canvas-background/components/canvas-background/colors';

@Component({
  selector: 'app-canvas-background',
  templateUrl: './canvas-background.component.html',
  styleUrls: ['./canvas-background.component.less'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasBackgroundComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('canvasElement') private canvas!: ElementRef<HTMLCanvasElement>;

  @HostListener('window:resize') onResize() {
    this.resize();
    this.spawnBoxes();
  }

  @HostListener('mousemove', ['$event']) onMouseMove(mouseEvent: CanvasMouseEvent) {
    this.light.x = mouseEvent.clientX;
    this.light.y = mouseEvent.clientY;
  }

  private context: CanvasRenderingContext2D | undefined | null;

  private readonly light: Light = {
    x: 160,
    y: 200
  };

  private boxes: CanvasBox[] = [];

  private readonly grey = grey;

  private readonly darkGrey = darkGrey;

  private readonly white = white;

  private readonly landingBodyClass = 'landing-body';

  private readonly boxesAmount = 20;

  ngOnInit(): void {
    document.body.classList.add(this.landingBodyClass);
  }

  ngOnDestroy(): void {
    document.body.classList.remove(this.landingBodyClass);
  }

  ngAfterViewInit(): void {
    this.context = this.canvas.nativeElement.getContext('2d');
    this.resize();
    this.draw();
    this.spawnBoxes();
  }

  private resize(): void {
    if (!this.canvas) {
      CanvasBackgroundComponent.throwErrorCanvasNotInitialized();
      return;
    }
    const clientRect = this.canvas.nativeElement.getBoundingClientRect();

    if (!clientRect) {
      CanvasBackgroundComponent.throwErrorCanvasNotInitialized();
      return;
    }

    this.canvas.nativeElement.width = clientRect.width;
    this.canvas.nativeElement.height = clientRect.height;
  }

  private drawLight(): void {
    if (!this.context) {
      CanvasBackgroundComponent.throwErrorCanvasNotInitialized();
      return;
    }
    const { x, y } = this.light;
    const startRadiusGradientStart = 0;
    const endRadiusGradientStart = 1000;
    const gradient1000 = 1000;
    const startAngle = 0;
    const endAngle = 2 * Math.PI;
    this.context.beginPath();
    this.context.arc(x, y, gradient1000, startAngle, endAngle);
    const gradientStart = this.context.createRadialGradient(
      x,
      y,
      startRadiusGradientStart,
      x,
      y,
      endRadiusGradientStart
    );

    const startGradient = 0;
    const endGradient = 1;
    gradientStart.addColorStop(startGradient, this.grey);
    gradientStart.addColorStop(endGradient, this.darkGrey);
    this.context.fillStyle = gradientStart;
    this.context.fill();

    this.context.beginPath();
    const gradient20 = 20;
    const startRadiusGradientEnd = 0;
    this.context.arc(x, y, gradient20, startRadiusGradientEnd, endAngle);

    const endRadiusGradientEnd = 5;
    const gradientEnd = this.context.createRadialGradient(
      x,
      y,
      startRadiusGradientEnd,
      x,
      y,
      endRadiusGradientEnd
    );
    gradientEnd.addColorStop(startGradient, this.white);
    gradientEnd.addColorStop(endGradient, this.grey);
    this.context.fillStyle = gradientEnd;
    this.context.fill();
  }

  private draw(): void {
    if (!this.context) {
      CanvasBackgroundComponent.throwErrorCanvasNotInitialized();
      return;
    }
    const { width: canvasWidth, height: canvasHeight } = this.canvas.nativeElement;
    this.context.clearRect(0, 0, canvasWidth, canvasHeight);
    this.drawLight();

    this.boxes.forEach((box) => {
      box.rotate();
      box.drawShadow();
    });

    this.boxes.forEach((box, boxIndex) => {
      this.collisionDetection(boxIndex);
      box.draw();
    });
    requestAnimationFrame(this.draw.bind(this));
  }

  private collisionDetection(collisionBoxIndex: number): void {
    for (let boxIndex = this.boxes.length - 1; boxIndex >= 0; boxIndex -= 1) {
      if (boxIndex === collisionBoxIndex) {
        continue;
      }

      let { halfSize: colBoxHalfSize } = this.boxes[collisionBoxIndex];
      const { x: colBoxX, y: colBoxY } = this.boxes[collisionBoxIndex];
      let { halfSize: boxHalfSize } = this.boxes[boxIndex];
      const { x: boxX, y: boxY } = this.boxes[boxIndex];
      const dx = colBoxX + colBoxHalfSize - (boxX + boxHalfSize);
      const dy = colBoxY + colBoxHalfSize - (boxY + boxHalfSize);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= boxHalfSize + boxHalfSize) {
        continue;
      }

      colBoxHalfSize = colBoxHalfSize > 1 ? (colBoxHalfSize -= 1) : 1;
      boxHalfSize = boxHalfSize > 1 ? (boxHalfSize -= 1) : 1;
    }
  }

  private static throwErrorCanvasNotInitialized(): void {
    throw new Error('canvas is  not initialized');
  }

  private spawnBoxes(): void {
    if (!this.context) {
      CanvasBackgroundComponent.throwErrorCanvasNotInitialized();
      return;
    }
    const { width: canvasWidth, height: canvasHeight } = this.canvas.nativeElement;
    this.boxes = [];
    for (let i = 0; i < this.boxesAmount; i += 1) {
      this.boxes.push(new Box(canvasWidth, canvasHeight, this.context, this.light));
    }
  }
}
