import { useState, useEffect, useRef } from 'react';

export function LazyImage({ src, alt, className = "" }: { src: string; alt?: string; className?: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: '200px' }
    );

    if (wrapperRef.current) {
      observer.observe(wrapperRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // We use a wrapper with display: contents so it doesn't affect the layout,
  // but can still be observed by IntersectionObserver.
  return (
    <div ref={wrapperRef} className="contents">
      {isInView ? (
        <img
          src={src}
          alt={alt}
          className={`${className} transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
          loading="lazy"
        />
      ) : (
         <div className={`${className} bg-zinc-200/50 animate-pulse`} aria-hidden="true" />
      )}
    </div>
  );
}
