import type { ImgHTMLAttributes } from 'react';

type AppImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  alt: string;
  src: string;
  priority?: boolean;
  unoptimized?: boolean;
};

function withDeploymentBase(src: string) {
  if (!src.startsWith('/') || src.startsWith('//')) return src;
  const base = import.meta.env.BASE_URL || '/';
  return `${base === '/' ? '' : base.replace(/\/$/, '')}${src}`;
}

export default function AppImage({ alt, priority, unoptimized, loading, src, ...props }: AppImageProps) {
  void unoptimized;
  return (
    // GitHub Pages needs a native image element; deployment-base rewriting is handled above.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...props}
      alt={alt}
      src={withDeploymentBase(src)}
      loading={priority ? 'eager' : loading ?? 'lazy'}
      decoding="async"
    />
  );
}
