import { animate, style, transition, trigger } from '@angular/animations';

export const fadeInAnimation = trigger('fadeIn', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(6px) scale(0.97)' }),
    animate(
      '250ms cubic-bezier(0.22, 1, 0.36, 1)',
      style({ opacity: 1, transform: 'translateY(0) scale(1)' }),
    ),
  ]),
]);
