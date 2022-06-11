import { Component } from '@angular/core';

interface Links {
  href: string;
  imgPath: string;
  imgAlt: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.less']
})
export class AppComponent {
  readonly socialLinks: Links[] = [
    {
      href: 'https://vk.com/khimenkov',
      imgPath: './assets/VK-Monochrom-Logo/Monochrome-White/VK_Monochrome_Compact_Logo.svg',
      imgAlt: 'VK'
    },
    {
      href: 'https://www.facebook.com/k.khimenkov/',
      imgPath:
        './assets/Facebook-Brand-Asset-Pack-2019/f-Logos-2019-1/f_Logo_Online_04_2019/white/PNG/f_logo_RGB-White_100.png',
      imgAlt: 'FB'
    },
    {
      href: 'https://www.instagram.com/k.khimenkov/',
      imgPath: './assets/Instagram-Logo-Pack/02-White-Glyph/Instagram_Glyph_White.svg',
      imgAlt: 'Instagram'
    },
    {
      href: 'https://github.com/cnstbmb',
      imgPath: './assets/GitHub-Mark/PNG/GitHub-Mark-Light-120px-plus.png',
      imgAlt: 'GitHub'
    },
    {
      href: 'https://www.linkedin.com/in/khimenkov',
      imgPath: './assets/LinkedIn-Logos/In/Digital/White/1x/In-White-96.png',
      imgAlt: 'LinkedIn'
    }
  ];
}
